const mysql = require('mysql2');

const con = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Charbel.2002',
    database: 'sakila',
});

con.connect((err) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('Database connected');
    }
});

module.exports = { con };
