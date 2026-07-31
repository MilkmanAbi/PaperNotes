---
title: MySQL Lab — Every Task, Answered
emoji: 🐬(๑˃ᴗ˂)
order: 6
blurb: The full MySQL practical from CREATE DATABASE to HAVING — tables, insert, delete, update, inner join, WHERE, COUNT + GROUP BY, and both challenge questions, with the exact SQL for each task.
---

# MySQL Lab — Every Task, Answered 🐬(๑˃ᴗ˂)

> Not on the sample Lab Test, but it's a graded practical and SQL is a genuinely useful forever-skill. Every task below has the working SQL. Type them, run with `Ctrl+Enter` one at a time in the VS Code MySQL extension, watch the grid update.

Setup assumed: MySQL Community Server 8.4 installed and running, VS Code MySQL extension connected. Then you work through a `.sql` file, running statements one by one.

---

## 1. Create the database

```sql
CREATE DATABASE myDB;
```

Then either `USE myDB;` at the top of your script, or fully-qualify table names as `myDB.students`. The practical uses the qualified form in places; both are fine.

---

## 2. Create the tables

Two tables. `students` holds people; `class` holds one attendance row per student per week.

```sql
CREATE TABLE myDB.students (
    adm   INT PRIMARY KEY,
    name  VARCHAR(50),
    email VARCHAR(50)
);

CREATE TABLE myDB.class (
    module VARCHAR(10),
    week   INT,
    adm    INT,
    ats    INT              -- 1 = attended, 0 = absent
);
```

- **`INT`** = whole number. **`VARCHAR(50)`** = text up to 50 characters.
- **`PRIMARY KEY`** on `adm` means it's the unique identifier - no two students share an `adm`, and it can't be null.
- `class.adm` links each attendance row back to a student (a foreign key in spirit, even if we don't declare the constraint here).

---

## 3. Insert the students

```sql
INSERT INTO myDB.students (adm, name, email) VALUES
(2500001, 'John',    'john@sp.edu'),
(2500002, 'Emily',   'emily@sp.edu'),
(2500003, 'Michael', 'michael@sp.edu'),
(2500004, 'Jessica', 'jessica@sp.edu'),
(2500005, 'David',   'david@sp.edu'),
(2500006, 'Ashley',  'ashley@sp.edu'),
(2500007, 'Chris',   'chris@sp.edu'),
(2500008, 'Armanda', 'armanda@sp.edu'),
(2500009, 'Daniel',  'daniel@sp.edu'),
(2500010, 'Sarah',   'sarah@sp.edu');
```

One `INSERT` with many value-rows is cleaner than ten separate inserts. Strings go in single quotes.

---

## 4. Retrieve, then delete

Retrieve everything:

```sql
SELECT * FROM myDB.students;      -- should show all 10 rows
```

Delete the last 4 (adm 2500007–2500010). Use `>=` on the primary key - precise and safe:

```sql
DELETE FROM myDB.students WHERE adm >= 2500007;
```

> **Always put a `WHERE` on `DELETE` and `UPDATE`.** A bare `DELETE FROM students;` wipes the whole table. This is the SQL equivalent of running with scissors.

---

## 5. Insert the attendance (class) data

Weeks 1–4 as given, plus week 5 (which we'll fix in a moment). Only the six enrolled students (2500001–2500006):

```sql
INSERT INTO myDB.class (module, week, adm, ats) VALUES
('ET0744', 1, 2500001, 1), ('ET0744', 1, 2500002, 1), ('ET0744', 1, 2500003, 0),
('ET0744', 1, 2500004, 1), ('ET0744', 1, 2500005, 1), ('ET0744', 1, 2500006, 0),
('ET0744', 2, 2500001, 1), ('ET0744', 2, 2500002, 0), ('ET0744', 2, 2500003, 0),
('ET0744', 2, 2500004, 1), ('ET0744', 2, 2500005, 1), ('ET0744', 2, 2500006, 1),
('ET0744', 3, 2500001, 1), ('ET0744', 3, 2500002, 1), ('ET0744', 3, 2500003, 0),
('ET0744', 3, 2500004, 1), ('ET0744', 3, 2500005, 1), ('ET0744', 3, 2500006, 1),
('ET0744', 4, 2500001, 1), ('ET0744', 4, 2500002, 1), ('ET0744', 4, 2500003, 1),
('ET0744', 4, 2500004, 0), ('ET0744', 4, 2500005, 1), ('ET0744', 4, 2500006, 1),
('ET0744', 5, 2500001, 0), ('ET0744', 5, 2500002, 0), ('ET0744', 5, 2500003, 0),
('ET0744', 5, 2500004, 0), ('ET0744', 5, 2500005, 0), ('ET0744', 5, 2500006, 0);
```

---

## 6. Update - fix week 5

Week 5 was entered wrong (all zeros). The corrected values: 001→0, 002→0, 003→1, 004→1, 005→1, 006→1. Only three rows actually change, but updating all six is clear and correct:

```sql
UPDATE myDB.class SET ats = 0 WHERE week = 5 AND adm = 2500001;
UPDATE myDB.class SET ats = 0 WHERE week = 5 AND adm = 2500002;
UPDATE myDB.class SET ats = 1 WHERE week = 5 AND adm = 2500003;
UPDATE myDB.class SET ats = 1 WHERE week = 5 AND adm = 2500004;
UPDATE myDB.class SET ats = 1 WHERE week = 5 AND adm = 2500005;
UPDATE myDB.class SET ats = 1 WHERE week = 5 AND adm = 2500006;
```

Each `WHERE week = 5 AND adm = ...` pins down exactly one row. `SET ats = ...` changes just that column.

---

## 7. Task A - INNER JOIN class with students

A JOIN stitches two tables together on a shared column. Here the shared column is `adm`. INNER JOIN keeps only rows that match in *both* tables:

```sql
SELECT * FROM myDB.class AS c
INNER JOIN myDB.students AS s
ON c.adm = s.adm;
```

- `AS c` / `AS s` are **aliases** - short nicknames so you write `c.adm` instead of `myDB.class.adm`.
- `ON c.adm = s.adm` is the matching rule: pair each class row with the student who shares its `adm`.
- Result: every attendance row now also carries that student's name and email.

---

## 8. Task B - records for one student

```sql
SELECT * FROM myDB.class WHERE adm = 2500002;
```

`WHERE` filters rows. This returns Emily's five attendance rows.

---

## 9. Task C - email of the student named Jessica

```sql
SELECT email FROM myDB.students WHERE name = 'Jessica';
```

`SELECT email` returns just that one column, not `*`. `WHERE name = 'Jessica'` finds the row.

---

## 10. Task D - COUNT + GROUP BY

Goal: how many attendances in week 1. First, *see* the rows you're counting:

```sql
SELECT * FROM myDB.class WHERE week = 1 AND ats = 1;
```

Then count them, grouped by week. **`COUNT` + `GROUP BY`** collapses many rows into one-per-group with a total:

```sql
SELECT week, COUNT(ats) AS attendance
FROM myDB.class
WHERE ats = 1 AND week = 1
GROUP BY week;
```

- `GROUP BY week` says "make one output row per distinct week."
- `COUNT(ats)` counts the rows in each group. With `WHERE ats = 1`, that's "number who attended."
- Rule to remember: with `GROUP BY`, every column in `SELECT` must either be **in the GROUP BY** or wrapped in an aggregate like `COUNT()`. You can't `SELECT adm` alongside `GROUP BY week` - which `adm` would it pick?

---

## 11. Task E - total attendance per student across 5 weeks

Same tool, grouped by `adm` instead of week:

```sql
SELECT adm, COUNT(ats) AS attendance
FROM myDB.class
WHERE ats = 1
GROUP BY adm;
```

This gives each student's attended-count over all weeks: 2500001→4, 2500002→3, 2500003→2, 2500004→4, 2500005→5, 2500006→4. `WHERE ats = 1` before grouping is what makes `COUNT` mean "attended" rather than "rows total."

---

## 12. Task F - add name and email (JOIN a grouped result)

Extend Task E so each row also shows who the student is. INNER JOIN the counts against `students`:

```sql
SELECT c.adm, COUNT(c.ats) AS attendance, s.name, s.email
FROM myDB.class AS c
INNER JOIN myDB.students AS s ON c.adm = s.adm
WHERE c.ats = 1
GROUP BY c.adm, s.name, s.email;
```

Because `name` and `email` are in the `SELECT` but aren't aggregated, they go in the `GROUP BY` too (the rule from Task D). Each student has one name/email, so grouping by them changes nothing about the counts - it just satisfies SQL.

> The practical hints at a subquery with `AS`. The JOIN above is the clean way and gives the same result. If you want the subquery style: compute Task E as a derived table and join `students` to it - same answer, more moving parts.

---

## 13. Challenge 1 - students with perfect attendance (HAVING)

"Perfect" = attended all 5 weeks = count is 5. You **cannot** filter a `COUNT` with `WHERE` (WHERE runs *before* grouping, when no count exists yet). The filter-after-grouping tool is **`HAVING`**:

```sql
SELECT adm, COUNT(ats) AS attendance
FROM myDB.class
WHERE ats = 1
GROUP BY adm
HAVING COUNT(ats) = 5;
```

- `WHERE ats = 1` filters *rows* before grouping.
- `HAVING COUNT(ats) = 5` filters *groups* after counting.
- Result: only 2500005 (David). The one perfect record.

> The one-liner that answers the exam question: **`WHERE` filters rows before `GROUP BY`; `HAVING` filters groups after.** You need `HAVING` any time your condition is on an aggregate.

---

## 14. Challenge 2 - perfect attendance, with name & email

Challenge 1 plus the JOIN from Task F:

```sql
SELECT c.adm, COUNT(c.ats) AS attendance, s.name, s.email
FROM myDB.class AS c
INNER JOIN myDB.students AS s ON c.adm = s.adm
WHERE c.ats = 1
GROUP BY c.adm, s.name, s.email
HAVING COUNT(c.ats) = 5;
```

Returns David, david@sp.edu, 5. Everything you've learned in one statement: filter rows, join tables, group, count, filter groups.

---

## 15. Recap flashcards

- `CREATE DATABASE`; `CREATE TABLE name (col TYPE, ... PRIMARY KEY)`; `INT`, `VARCHAR(n)`.
- `INSERT INTO t (cols) VALUES (...), (...);` - many rows in one statement, strings in `'quotes'`.
- **Always `WHERE` your `DELETE`/`UPDATE`.** No WHERE = whole table.
- `SELECT cols FROM t WHERE cond;` - `*` for all columns, name columns to narrow.
- `INNER JOIN b ON a.key = b.key`, with `AS` aliases, keeps only matching rows.
- `COUNT(x) ... GROUP BY g` - one row per group; non-aggregated SELECT columns must be in GROUP BY.
- **`WHERE` before grouping, `HAVING` after.** Filter aggregates with `HAVING`.

Next: the same data, but in MongoDB with Node.js. →
