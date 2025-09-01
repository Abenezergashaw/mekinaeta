// db.js
const mysql = require("mysql2/promise");

// Create the pool
// const pool = mysql.createPool({
//   host: "localhost", // or your DB host
//   user: "root", // your MySQL username
//   password: "", // your MySQL password
//   database: "mekina_eta", // your database name
//   waitForConnections: true,
//   connectionLimit: 10, // adjust as needed
//   queueLimit: 0,
// });

const pool = mysql.createPool({
  host: "localhost",
  user: "abeni",
  password: "123456",
  database: "mekina_eta",
});

(async () => {
  try {
    const connection = await pool.getConnection();
    console.log("✅ MySQL DB Connected");
    connection.release(); // important: release back to pool
  } catch (err) {
    console.error("❌ MySQL Connection Error:", err.message);
  }
})();

module.exports = pool;
