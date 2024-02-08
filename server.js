const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const connect = require('./connection');
const app = express();
exports.app = app;
const bcrypt = require('bcrypt');
const port = 3000;
const ncp = require('ncp');
const fs = require('fs');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));



app.use(session({
    secret: 'your-secret-key', // Replace with a secure key
    resave: false,
    saveUninitialized: true,
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('html file'));
app.use(bodyParser.json());
app.use('/client', express.static(path.join(__dirname, 'client')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));


app.get("/", (req, res) => {
    const indexPath = path.join(__dirname, "html file", "index.html");
    res.sendFile(indexPath);
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    connect.con.query(
        'SELECT * FROM user WHERE email=?',
        [email],
        async function (err, result) {
            if (err) {
                console.error("Error querying database:", err);
                res.status(500).json({ error: 'Internal Server Error' });
                return;
            }

            if (result.length > 0) {
                const user = result[0];

                try {
                    const passwordMatch = await bcrypt.compare(password, user.password);

                    if (passwordMatch) {
                        req.session.username = user.name; // Set username in session

                        if (user.email === 'admin@gmail.com') {
                            console.log('Login as an admin');
                            req.session.role = 'admin';
                            res.redirect('/admin/update.html');
                        } else {
                            console.log('Login successful for a regular user');
                            req.session.role = 'user';
                            res.redirect('/client/About.html');
                        }
                    } else {
                        console.log('Password is wrong');
                        res.status(401).json({ error: 'Invalid credentials' });
                    }
                } catch (error) {
                    console.error('Error comparing passwords:', error);
                    res.status(500).json({ error: 'Internal Server Error' });
                }
            } else {
                console.log('User not found');
                res.status(401).json({ error: 'Invalid credentials' });
            }
        }
    );
});





app.post('/signup', async (req, res) => {
    console.log('Received signup request');
    const { email, name, password, confirmpassword, mobile } = req.body;

    if (password === confirmpassword) {
        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            connect.con.query(
                'INSERT INTO user (email, name, password, mobile) VALUES (?, ?, ?, ?)',
                [email, name, hashedPassword, mobile],
                function (err, result) {
                    if (err) {
                        console.error('Error executing database query:', err);
                        res.status(500).send('Internal Server Error');
                        return;
                    } else if (result.affectedRows > 0) {
                        console.log('User registered successfully');
                        req.session.username = name;

                        // Check if the registered user is the admin
                        if (email === 'admin@gmail.com') {
                            res.redirect('/admin/see.html');
                        } else {
                            res.redirect('/client/About.html');
                        }
                    } else {
                        console.log('Failed to insert user');
                        res.status(500).send('Internal Server Error');
                    }
                }
            );
        } catch (error) {
            console.error('Error hashing password:', error);
            res.status(500).send('Error hashing password');
        }
    } else {
        console.log("Password that you put in the second time is incorrect");
        res.status(400).send('Password mismatch');
    }
});


app.post('/order', (req, res) => {
    const username = req.session.username;
    console.log("Received order request from:", username);

    if (!username) {
        console.log("User not logged in.");
        return res.status(401).send('Unauthorized');
    }

    const { tshirt_id, price } = req.body;

    connect.con.query('SELECT stock FROM tshirt_stock WHERE tshirt_id = ?', [tshirt_id], (err, results) => {
        if (err) {
            console.error('Error querying database:', err);
            return res.status(500).send('Internal Server Error');
        }

        if (results.length === 0) {
            console.log("T-shirt not found.");
            return res.status(404).send('T-shirt not found');
        }

        const stock = results[0].stock;
        if (stock === 0) {
            console.log("T-shirt out of stock.");
            return res.status(400).send('T-shirt out of stock');
        }

        const newStock = stock - 1;

        connect.con.query('UPDATE tshirt_stock SET stock = ? WHERE tshirt_id = ?', [newStock, tshirt_id], (updateErr) => {
            if (updateErr) {
                console.error('Error updating stock in the database:', updateErr);
                return res.status(500).send('Internal Server Error');
            }

            connect.con.query('INSERT INTO orders (username, tshirt_id, total_price, date) VALUES (?, ?, ?, NOW())', [username, tshirt_id, price], (insertErr) => {
                if (insertErr) {
                    console.error('Error inserting order into the database:', insertErr);
                    return res.status(500).send('Internal Server Error');
                }

                console.log("Order placed successfully.");
                return res.status(200).send('Order placed successfully');
            });
        });
    });
});



app.use('/admin/uploads', express.static(path.join(__dirname, 'admin', 'uploads')));


app.get('/admin/uploads', (req, res) => {
    // Query the tshirt_stock table to get the T-shirts data
    connect.con.query('SELECT * FROM tshirt_stock', (err, results) => {
        if (err) {
            console.error('Error querying database:', err);
            res.status(500).send('Internal Server Error');
            return;
        }
        // Send the T-shirts data as JSON response
        res.json(results);
    });
});



const uploadDir = path.join(__dirname, 'admin', 'uploads');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        fs.mkdirSync(uploadDir, { recursive: true }); // Ensure the directory exists, creating it if necessary
        cb(null, uploadDir); // Destination folder for file uploads
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

app.get('/admin/update', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'update.html'));
});


app.post('/admin/update', upload.single('photo'), (req, res) => {
    const { action, tshirtId, stock, price } = req.body;
    const photoPath = req.file ? '/admin/uploads/' + req.file.filename : ''; // Get the path to the uploaded photo

    if (req.session.role === 'admin') {
        switch (action) {
            case 'addStock':
                connect.con.query('UPDATE tshirt_stock SET stock = stock + ? WHERE tshirt_id = ?', [stock, tshirtId], (updateErr) => {
                    if (updateErr) {
                        console.error('Error updating stock in the database:', updateErr);
                        res.status(500).send('Internal Server Error');
                    } else {
                        res.send('Stock added successfully');
                        console.log('Action:', action);
                        console.log('T-Shirt ID:', tshirtId);
                        console.log('Stock:', stock);
                        console.log('Price:', price);
                    }
                });
                break;
            case 'updateprice':
                console.log('Update Price Case');
                connect.con.query('UPDATE tshirt_stock SET price = ? WHERE tshirt_id = ?', [price, tshirtId], (updateErr) => {
                    if (updateErr) {
                        console.error('Error updating price in the database:', updateErr);
                        res.status(500).send('Internal Server Error');
                    } else {
                        res.send('Price updated successfully');
                        console.log('Action:', action);
                        console.log('T-Shirt ID:', tshirtId);
                        console.log('Stock:', stock);
                        console.log('Price:', price);
                    }
                });
                break;
            case 'delete':
                console.log('Remove Case');
                connect.con.query('DELETE FROM tshirt_stock WHERE tshirt_id = ?', [tshirtId], (deleteErr) => {
                    if (deleteErr) {
                        console.error('Error removing t-shirt from the database:', deleteErr);
                        res.status(500).send('Internal Server Error');
                    } else {
                        res.send('T-shirt removed successfully');
                        console.log('Action:', action);
                        console.log('T-Shirt ID:', tshirtId);
                    }
                });
                break;
            case 'add':
                console.log('Add Case');
                connect.con.query('INSERT INTO tshirt_stock (tshirt_id, stock, price, photo_path) VALUES (?, ?, ?, ?)', [tshirtId, stock, price, photoPath], (addErr) => {
                    if (addErr) {
                        console.error('Error adding t-shirt to the database:', addErr);
                        res.status(500).send('Internal Server Error');
                    } else {
                        res.send('T-shirt added successfully');
                        console.log('Action:', action);
                        console.log('T-Shirt ID:', tshirtId);
                        console.log('Stock:', stock);
                        console.log('Price:', price);
                        console.log('Photo Path:', photoPath);
                    }
                });
                break;
            default:
                res.status(400).send('Invalid action');
                break;
        }
    } else {
        res.redirect('/');
    }
});





app.get('/data', (req, res) => {
    const sql = 'SELECT * FROM orders';

    connect.con.query(sql, (err, results) => {
        if (err) {
            console.error('Error fetching data:', err);
            res.status(500).json({ error: 'Internal Server Error' });
            return;
        }
        res.json(results);
    });
});


app.post('/delete', (req, res) => {
    const orderId = req.body.id;
    const sql = 'DELETE FROM orders WHERE order_id = ?';

    connect.con.query(sql, [orderId], (err, result) => {
        if (err) {
            console.error('Error deleting item:', err);
            res.json({ success: false, message: 'Internal Server Error' });
            return;
        }
        res.json({ success: true });
    });
});




/*
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, 'client', 'uploads'));
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });


app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    } 
    res.send('File uploaded successfully!');
});




app.get('/files', (req, res) => {
    const folderPath = path.join(__dirname, 'client','uploads'); 
   
    fs.readdir(folderPath, (err, files) => {
        if (err) {
            console.error('Error reading files:', err);
            res.status(500).send('Internal Server Error');
        } else {
            res.json({ files });
        }
    });
});

app.get('/file/:filename', (req, res) => {
    const folderPath = path.join(__dirname, 'client','uploads'); 
    const filePath = path.join(folderPath, req.params.filename);
    
    fs.readFile(filePath, 'utf8', (err, content) => {
        if (err) {
            console.error('Error reading file content:', err);
            res.status(500).send('Internal Server Error');
        } else {
            res.send(content);
        }
    });
});
*/


app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
