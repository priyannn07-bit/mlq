# Pennywise — Micro-expense & Subscription Dashboard

Track expenses by category, compare monthly outgoings with a configurable budget, and identify subscriptions unused for two or more months. The dashboard follows the diagnosis rules in `MicroExpenseSubscriptionDiagnosis`.

Run:
    python -m pip install -r requirements.txt
    python app.py
Open http://127.0.0.1:5000 in your browser (keep the terminal running).

Data is stored in microexpense.db (SQLite, created automatically).
The default monthly budget is ₹1,500 and can be changed on the Diagnosis tab.
A new, empty database starts with the example expenses and subscriptions from the Java program. Existing data is kept unchanged.
