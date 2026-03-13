import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("hospital.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    patientName TEXT,
    phoneNumber TEXT,
    problem TEXT,
    time TEXT,
    date TEXT,
    status TEXT,
    doctor TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/appointments", (req, res) => {
    const appointments = db.prepare("SELECT * FROM appointments ORDER BY createdAt DESC").all();
    res.json(appointments);
  });

  app.post("/api/appointments", (req, res) => {
    const { id, patientName, phoneNumber, problem, time, date, status, doctor } = req.body;
    
    // Check if an appointment with the same phone number already exists
    const existing = db.prepare("SELECT id FROM appointments WHERE phoneNumber = ?").get(phoneNumber);
    
    if (existing) {
      // Update existing appointment
      const stmt = db.prepare(`
        UPDATE appointments 
        SET patientName = ?, problem = ?, time = ?, date = ?, status = ?, doctor = ?
        WHERE id = ?
      `);
      stmt.run(patientName, problem, time, date, status, doctor, existing.id);
    } else {
      // Insert new appointment
      const stmt = db.prepare(`
        INSERT INTO appointments (id, patientName, phoneNumber, problem, time, date, status, doctor)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(id, patientName, phoneNumber, problem, time, date, status, doctor);
    }
    res.json({ success: true });
  });

  app.delete("/api/appointments/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM appointments WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
