// Import required modules
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const request = require('request');
// Create a new SQLite database (or connect to an existing one)
const db = new sqlite3.Database('./shop.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the SQLite database.');
});



function fetchPublicIpDetails(callback) {
    getClientPublicIp((err, result) => {
        if (err) {
            callback('Error fetching IP details', null);
        } else {
            callback(null, result);
        }
    });
}


// Create an Express application
const app = express();
app.use(cookieParser());
// Serve static files from the 'public' directory
app.use(express.static('public'));

// Set EJS as the view engine
app.set('view engine', 'ejs');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


// Define a route to handle POST request from the form
app.post('/send-message', (req, res) => {
    const name = req.body.name;
    const phoneNumber = req.body.phoneNumber;
    const email = req.body.email;
    const message = req.body.message;
    const ip = req.body.ipAddress;
    const country = req.body.country;
    // Get the current date and time
    const sentTime = new Date().toISOString();
            // Handle error
            const sql = `INSERT INTO messages (name, phoneNumber, email, message, sentTime,ip,country) VALUES (?, ?, ?, ?, ?,?,?)`;
            db.run(sql, [name, phoneNumber, email, message, sentTime,ip,country], function(err) {
            if (err) {
                // If an error occurs, redirect with an error message
                res.redirect('/contact?success=false&message=' + encodeURIComponent(err.message));
            } else {
                // If successful, redirect with a success message
                res.redirect('/contact?success=true&message=' + encodeURIComponent('Message sent successfully!'));
            }
    });
    // Insert the data into the SQLite database table named messages
    
});
app.get('/clear-cart-cookie', (req, res) => {
    // Clear the cart cookie named "cart"
    res.clearCookie('cart');

    // Redirect to some other route or send a response as per your requirements
    res.send('Cart cookie cleared successfully!');
});

app.post('/save-visit', (req, res) => {
    const { ip, country, datetime } = req.body;
  
    // Insert data into the 'visits' table
    db.run('INSERT INTO visits (ip, country, datetime) VALUES (?, ?, ?)', [ip, country, datetime], function(err) {
      if (err) {
        res.status(500).send({ success: false, error: 'Failed to save visit' });
      } else {
        res.status(200).send({ success: true });
      }
    });
  });


app.post('/save-order', (req, res) => {
    const { name, address, phone, selectedDays,ip,country } = req.body;
    // Function to parse cart items from cookies
    const parseCartItemsFromCookies = (cookieStr) => {
        const cartItems = {};
        if (cookieStr) {
            const ids = cookieStr.split(','); // Assuming IDs are comma-separated in the cookie
            ids.forEach(id => {
                cartItems[id] = (cartItems[id] || 0) + 1; // Count each ID
            });
        }
        return cartItems;
    };

    const cartCookie = req.cookies.cart; // Assuming the cookie name is 'cart'
    const parsedCartItems = parseCartItemsFromCookies(cartCookie);
            const sql = `INSERT INTO orders (name, address, phone, days, cartItems,ip,country) VALUES (?, ?, ?, ?, ?,?,?)`;
    
            db.run(sql, [name, address, phone, JSON.stringify(selectedDays), JSON.stringify(parsedCartItems),ip,country], function(err) {
                if (err) {
                    return res.status(400).json({ success: false, message: err.message });
                }
                
                // Construct the WhatsApp message
                const whatsappMessage = `Order Details:\nName: ${name}\nAddress: ${address}\nPhone: ${phone}\nDays:${JSON.stringify(selectedDays)}\nItems: ${JSON.stringify(parsedCartItems)}`;

                // Redirect to WhatsApp with the message
                res.status(200).json({ success: true, whatsappLink: `https://wa.me/96179124494?text=${encodeURIComponent(whatsappMessage)}` });
            });
        });



app.get('/contact',(req,res)=>{
    res.render('contact');
});
app.get('/cart', (req, res) => {
    // Parse the 'cart' cookie to get the product IDs
    const cart = req.cookies.cart ? req.cookies.cart.split(',') : [];

    // Count the quantity of each product ID
    const itemCounts = {};
    cart.forEach(productId => {
        itemCounts[productId] = (itemCounts[productId] || 0) + 1;
    });

    // Retrieve products from the database based on the product IDs
    const sql = `SELECT * FROM products WHERE id IN (${cart.join(',')})`;
    
    db.all(sql, [], (err, products) => {
        if (err) {
            return res.status(500).send('Internal Server Error');
        }

        // Calculate the total amount
        let totalAmount = 0;
        products.forEach(product => {
            const quantity = itemCounts[product.id] || 0;
            totalAmount += product.price * quantity;
        });
        // Render the 'cart.ejs' template with products, their quantities, and the total amount
        res.render('cart', { products, itemCounts, totalAmount: totalAmount.toFixed(2) });
    });
});


function setOrUpdateCookie(res, name, value, options = {}) {
    // Get existing cookies from the response header
    const existingCookies = res.get('Set-Cookie') || [];
  
    // Check if the cookie with the specified name already exists
    const cookieIndex = existingCookies.findIndex(cookie => cookie.startsWith(`${name}=`));
  
    // Generate the cookie string with the name and value
    const cookieString = `${name}=${value};`;
  
    // Convert the options object to a string and append it to the cookie string
    const optionsString = Object.entries(options).map(([key, value]) => `${key}=${value}`).join('; ');
    
    // Construct the final cookie string
    const finalCookieString = `${cookieString} ${optionsString}`;
  
    if (cookieIndex !== -1) {
      // If the cookie already exists, replace it
      existingCookies[cookieIndex] = finalCookieString;
    } else {
      // If the cookie does not exist, add it to the existing cookies
      existingCookies.push(finalCookieString);
    }
  
    // Set the updated cookies in the response headers
    res.set('Set-Cookie', existingCookies);
}

function parseCookies(cookieHeader) {
    const cookies = {};
    cookieHeader && cookieHeader.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        cookies[parts.shift().trim()] = decodeURI(parts.join('='));
    });
    return cookies;
}

// Function to add a product ID to the 'cart' cookie
function addToCart(res, productId, cookieHeader) {
    // Parse the existing cookies from the request headers
    const cookies = parseCookies(cookieHeader);

    // Retrieve the existing 'cart' cookie value
    const existingCart = cookies['cart'] || '';

    let newCartValue = productId;

    if (existingCart) {
        // Append the new product ID to the existing cart value with a comma
        newCartValue = `${existingCart},${productId}`;
    }

    // Set or update the 'cart' cookie with the new value
    setOrUpdateCookie(res, 'cart', newCartValue, { 'Max-Age': 604800, 'Path': '/' }); // Set Max-Age to 7 days and Path to '/'
}
// Subtract from cart
app.get('/subtract-from-cart/:productId', (req, res) => {
    const productId = req.params.productId;
    // Retrieve the cookie header from the request headers
    const cookieHeader = req.headers.cookie;

    // Parse the existing cookies from the request headers
    const cookies = parseCookies(cookieHeader);

    // Retrieve the existing 'cart' cookie value
    let existingCart = cookies['cart'] || '';

    // Convert the cart string to an array
    const cartArray = existingCart.split(',');

    // Find the index of the product ID in the cart array
    const index = cartArray.indexOf(productId);

    if (index !== -1) {
        // Remove one occurrence of the product ID from the cart array
        cartArray.splice(index, 1);
        
        // Update the 'cart' cookie with the updated cart array joined as a string
        setOrUpdateCookie(res, 'cart', cartArray.join(','), { 'Max-Age': 604800, 'Path': '/' }); // Set Max-Age to 7 days and Path to '/'
    }

    // Redirect back to the cart page
    res.redirect('/cart');
});

// Remove from cart
app.get('/remove-from-cart/:productId', (req, res) => {
    const productId = req.params.productId;
    // Retrieve the cookie header from the request headers
    const cookieHeader = req.headers.cookie;

    // Parse the existing cookies from the request headers
    const cookies = parseCookies(cookieHeader);

    // Retrieve the existing 'cart' cookie value
    let existingCart = cookies['cart'] || '';

    // Convert the cart string to an array
    const cartArray = existingCart.split(',');

    // Filter out all occurrences of the product ID from the cart array
    const updatedCartArray = cartArray.filter(id => id !== productId);
    
    // Update the 'cart' cookie with the updated cart array joined as a string
    setOrUpdateCookie(res, 'cart', updatedCartArray.join(','), { 'Max-Age': 604800, 'Path': '/' }); // Set Max-Age to 7 days and Path to '/'

    // Redirect back to the cart page
    res.redirect('/cart');
});

app.get('/add-to-cart-/:productId', (req, res) => {
    // Retrieve the product ID from the request parameters
    const productId = req.params.productId;

    // Retrieve the cookie header from the request headers
    const cookieHeader = req.headers.cookie;

    // Add the product ID to the 'cart' cookie
    addToCart(res, productId, cookieHeader);

    // Send a JSON response indicating success
    res.redirect('/cart');
});
app.get('/add-to-cart/:productId', (req, res) => {
    // Retrieve the product ID from the request parameters
    const productId = req.params.productId;

    // Retrieve the cookie header from the request headers
    const cookieHeader = req.headers.cookie;

    // Add the product ID to the 'cart' cookie
    addToCart(res, productId, cookieHeader);

    // Send a JSON response indicating success
    res.json({ success: true });
});


// Define routes
app.get('/', (req, res) => {
  // Fetch products from SQLite database
  const sql = 'SELECT * FROM products';
  db.all(sql, [], (err, rows) => {
    if (err) {
      throw err;
    }
    // Render the homepage and pass the products data to the EJS template
    res.render('index', { products: rows });
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Close the SQLite database connection when the Node.js process terminates
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Closed the SQLite database connection.');
    process.exit(0);
  });
});
