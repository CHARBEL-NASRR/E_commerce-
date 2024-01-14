const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const connect = require('./connection');
const app = express();
const port = 3000;
const bcrypt = require('bcrypt');
const ncp = require('ncp');
const fs = require('fs');


app.use(session({
    secret: 'your-secret-key', // Replace with a secure key
    resave: false,
    saveUninitialized: true,
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('html file'));
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
                        req.session.username = user.name; 

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
                        res.redirect('/client/About.html');
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
    if (!username) {
        res.redirect('/');
        return;
    }

    const tshirtId = req.body.tshirtId;
    connect.con.query('SELECT stock, price FROM tshirt_stock WHERE tshirt_id = ?', [tshirtId], (err, results) => {
        if (err) {
            console.error('Error querying database:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        if (results.length > 0 && results[0].stock > 0) {
            const newStock = results[0].stock - 1;
            const totalPrice = results[0].price;

            
            connect.con.query('UPDATE tshirt_stock SET stock = ? WHERE tshirt_id = ?', [newStock, tshirtId], (updateErr) => {
                if (updateErr) {
                    console.error('Error updating stock in the database:', updateErr);
                    res.status(500).send('Internal Server Error');
                } else {
                    res.status(400).send('succses');
                    
                    connect.con.query('INSERT INTO orders (username, tshirt_id, total_price) VALUES (?, ?, ?)', [username, tshirtId, totalPrice], (insertErr) => {
                        if (insertErr) {
                            console.error('Error inserting order into the database:', insertErr);
                            res.status(500).send('Internal Server Error');
                        } else {
                            res.status(400).send('succses');
                           
                        }
                    });
                }
            });
        } else {
            res.status(400).send('T-shirt out of stock!');
           
        }
    });
});



app.post('/admin/update', (req, res) => {
    const { action, tshirtId, stock, price } = req.body;
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
                console.log('remouve case');
                connect.con.query('DELETE FROM tshirt_stock WHERE tshirt_id = ?', [tshirtId], (deleteErr) => {
                    if (deleteErr) {
                        console.error('Error removing t-shirt from the database:', deleteErr);
                        res.status(500).send('Internal Server Error');
                    } else {
                        res.send('T-shirt removed successfully');
                        console.log('Action:', action);
                        console.log('T-Shirt ID:', tshirtId);
                        console.log('Stock:', stock);
                        console.log('Price:', price);
                    }
                });
                break;
            case 'add':
                console.log('Add Case');
                
                connect.con.query('INSERT INTO tshirt_stock (tshirt_id, stock, price) VALUES (?, ?, ?)', [tshirtId, stock, price], (addErr) => {
                    if (addErr) {
                        console.error('Error adding t-shirt to the database:', addErr);
                        res.status(500).send('Internal Server Error');
                    } else {
                        res.send('T-shirt added successfully');
                        console.log('Action:', action);
                        console.log('T-Shirt ID:', tshirtId);
                        console.log('Stock:', stock);
                        console.log('Price:', price);
                    }
                });
                break;

            default:
                res.status(400).send('Invalid action');
                return;
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


app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
