import os
import math
import sqlite3
from datetime import datetime, timezone

from flask import Flask, g, jsonify, render_template, request

BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(BASE, "microexpense.db")

app = Flask(__name__)


def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db():
    conn = sqlite3.connect(DB)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            n TEXT NOT NULL, a REAL NOT NULL, c TEXT NOT NULL, d TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS subs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            n TEXT NOT NULL, a REAL NOT NULL, cy TEXT NOT NULL, u INTEGER NOT NULL,
            category TEXT NOT NULL DEFAULT 'Other',
            unused_months INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY, value REAL NOT NULL
        );
        """
    )
    columns = {row[1] for row in conn.execute("PRAGMA table_info(subs)")}
    if "category" not in columns:
        conn.execute(
            "ALTER TABLE subs ADD COLUMN category TEXT NOT NULL DEFAULT 'Other'"
        )
    if "unused_months" not in columns:
        conn.execute(
            "ALTER TABLE subs ADD COLUMN unused_months INTEGER NOT NULL DEFAULT 0"
        )
    conn.execute(
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('monthly_budget', 1500)"
    )
    demo_seeded = conn.execute(
        "SELECT value FROM settings WHERE key='demo_seeded'"
    ).fetchone()
    if demo_seeded is None:
        has_existing_data = (
            conn.execute("SELECT EXISTS(SELECT 1 FROM expenses)").fetchone()[0]
            or conn.execute("SELECT EXISTS(SELECT 1 FROM subs)").fetchone()[0]
        )
        if not has_existing_data:
            created_at = datetime.now(timezone.utc).isoformat()
            conn.executemany(
                "INSERT INTO expenses (n,a,c,d) VALUES (?,?,?,?)",
                [
                    ("Snacks", 180, "Food", created_at),
                    ("Auto", 120, "Travel", created_at),
                    ("Coffee", 90, "Food", created_at),
                    ("Stationery", 250, "Shopping", created_at),
                    ("Bus", 80, "Travel", created_at),
                ],
            )
            conn.executemany(
                """INSERT INTO subs (n,a,cy,u,category,unused_months)
                   VALUES (?,?, 'm', 0, ?, ?)""",
                [
                    ("Music Plus", 149, "Entertainment", 0),
                    ("Cloud Storage", 199, "Utility", 3),
                    ("Video Premium", 299, "Entertainment", 2),
                ],
            )
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('demo_seeded', 1)"
        )
    conn.commit()
    conn.close()


@app.route("/")
def index():
    return render_template("index.html")


@app.get("/api/expenses")
def list_expenses():
    rows = db().execute("SELECT * FROM expenses ORDER BY id").fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/expenses")
def add_expense():
    j = request.get_json(force=True)
    n = str(j.get("n", j.get("description", ""))).strip()[:40]
    c = str(j.get("c", j.get("category", "Other"))).strip()[:40] or "Other"
    try:
        a = float(j.get("a", j.get("amount")))
    except (TypeError, ValueError):
        return jsonify(error="Amount must be a number"), 400
    if not n or not math.isfinite(a) or a <= 0:
        return jsonify(error="Name and a positive amount are required"), 400
    d = datetime.now(timezone.utc).isoformat()
    db().execute("INSERT INTO expenses (n,a,c,d) VALUES (?,?,?,?)", (n, a, c, d))
    db().commit()
    return jsonify(ok=True), 201


@app.delete("/api/expenses/<int:i>")
def del_expense(i):
    db().execute("DELETE FROM expenses WHERE id=?", (i,))
    db().commit()
    return jsonify(ok=True)


@app.get("/api/subs")
def list_subs():
    rows = db().execute("SELECT * FROM subs ORDER BY id").fetchall()
    return jsonify([
        {
            "id": row["id"],
            "n": row["n"],
            "category": row["category"],
            "a": row["a"] / 12 if row["cy"] == "y" else row["a"],
            "unusedMonths": row["unused_months"],
        }
        for row in rows
    ])


@app.post("/api/subs")
def add_sub():
    j = request.get_json(force=True)
    n = str(j.get("n", "")).strip()[:40]
    category = str(j.get("category", "Other")).strip()[:40] or "Other"
    try:
        a = float(j.get("a", j.get("monthlyCost")))
        unused_months = int(j.get("unusedMonths", 0))
    except (TypeError, ValueError):
        return jsonify(error="Price and unused months must be numbers"), 400
    if not n or not math.isfinite(a) or a <= 0 or unused_months < 0:
        return jsonify(error="Name, positive price and valid usage are required"), 400
    db().execute(
        "INSERT INTO subs (n,a,cy,u,category,unused_months) VALUES (?,?,?,0,?,?)",
        (n, a, "m", category, unused_months),
    )
    db().commit()
    return jsonify(ok=True), 201


@app.delete("/api/subs/<int:i>")
def del_sub(i):
    db().execute("DELETE FROM subs WHERE id=?", (i,))
    db().commit()
    return jsonify(ok=True)


@app.get("/api/budget")
def get_budget():
    row = db().execute(
        "SELECT value FROM settings WHERE key='monthly_budget'"
    ).fetchone()
    return jsonify(monthlyBudget=row["value"])


@app.put("/api/budget")
def update_budget():
    j = request.get_json(force=True)
    try:
        amount = float(j.get("monthlyBudget"))
    except (TypeError, ValueError):
        return jsonify(error="Budget must be a number"), 400
    if not math.isfinite(amount) or amount <= 0:
        return jsonify(error="Enter a positive monthly budget"), 400
    db().execute(
        "UPDATE settings SET value=? WHERE key='monthly_budget'", (amount,)
    )
    db().commit()
    return jsonify(monthlyBudget=amount)


init_db()

if __name__ == "__main__":
    app.run(debug=True)
