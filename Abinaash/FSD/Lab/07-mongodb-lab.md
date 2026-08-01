---
title: MongoDB Lab — Node.js Driver, Every Task
emoji: (๑˃ᴗ˂)ﻭ
order: 7
blurb: Practice 9 in full — connect from Node.js, insert/find/delete/update the same student and attendance data, then answer Tasks A–D with find, $lookup joins, and $group aggregation, printed with console.log.
---

# MongoDB Lab — Node.js Driver, Every Task (๑˃ᴗ˂)ﻭ

> Same data as the MySQL lab, different database. Here you drive it from a **Node.js script** with the official `mongodb` driver, and print results with `console.log`. It's the bridge between "backend JS" and "a real database."

Setup: MongoDB Community Server + Compass installed and running (Compass is the GUI; the server listens on `mongodb://localhost:27017`). You write a `.js` file and run it with `node`.

---

## 1. Project + driver

```bash
mkdir mongo-lab
cd mongo-lab
npm init -y
npm install mongodb
```

Every script follows the same skeleton: connect, do work, close. Wrap the work in an `async` function so you can `await` each database call:

```js
const { MongoClient } = require("mongodb");
const client = new MongoClient("mongodb://localhost:27017");

async function main() {
    await client.connect();
    const db = client.db("myDB");          // pick the database
    const students = db.collection("students");   // pick a collection

    // ...do the task here...

    await client.close();
}

main();
```

- A **database** holds **collections**; a collection holds **documents** (JSON-ish objects). Collections/DBs are created lazily - the first insert brings them into being.
- `await` waits for each async DB call to finish before the next line. Forget `await` and you'll `console.log` before the data arrives (you'll see a `Promise` or `undefined`).

---

## 2. Insert the students

Documents are just objects. `insertMany` takes an array:

```js
await students.insertMany([
    { adm: 2500001, name: "John",    email: "john@sp.edu" },
    { adm: 2500002, name: "Emily",   email: "emily@sp.edu" },
    { adm: 2500003, name: "Michael", email: "michael@sp.edu" },
    { adm: 2500004, name: "Jessica", email: "jessica@sp.edu" },
    { adm: 2500005, name: "David",   email: "david@sp.edu" },
    { adm: 2500006, name: "Ashley",  email: "ashley@sp.edu" },
    { adm: 2500007, name: "Chris",   email: "chris@sp.edu" },
    { adm: 2500008, name: "Armanda", email: "armanda@sp.edu" },
    { adm: 2500009, name: "Daniel",  email: "daniel@sp.edu" },
    { adm: 2500010, name: "Sarah",   email: "sarah@sp.edu" }
]);
```

Mongo auto-adds an `_id` field to each document. That's fine; we key on our own `adm`.

> Run inserts **once.** Run the script twice and you get duplicates (unlike a SQL primary key, plain Mongo won't stop you). If you double-insert, drop the collection in Compass and re-run, or `await students.deleteMany({})` to clear it first.

---

## 3. Retrieve all

`find()` returns a cursor; `.toArray()` pulls it into a normal array you can log:

```js
const all = await students.find().toArray();
console.log(all);        // all 10 documents
```

`find({})` with an empty filter = everything. A filter narrows it (next).

---

## 4. Delete the last 4

The Mongo equivalent of `WHERE adm >= 2500007` uses the `$gte` (greater-than-or-equal) operator:

```js
await students.deleteMany({ adm: { $gte: 2500007 } });
```

Mongo query operators start with `$`: `$gte`, `$gt`, `$lte`, `$lt`, `$eq`, `$ne`. `{ adm: { $gte: 2500007 } }` reads as "documents where adm ≥ 2500007."

---

## 5. Create the class collection + insert attendance

You can make a collection explicitly (or just insert into it - it appears on first insert):

```js
await db.createCollection("class");
const cls = db.collection("class");

await cls.insertMany([
    { module: "ET0744", week: 1, adm: 2500001, ats: 1 },
    { module: "ET0744", week: 1, adm: 2500002, ats: 1 },
    { module: "ET0744", week: 1, adm: 2500003, ats: 0 },
    { module: "ET0744", week: 1, adm: 2500004, ats: 1 },
    { module: "ET0744", week: 1, adm: 2500005, ats: 1 },
    { module: "ET0744", week: 1, adm: 2500006, ats: 0 },
    { module: "ET0744", week: 2, adm: 2500001, ats: 1 },
    { module: "ET0744", week: 2, adm: 2500002, ats: 0 },
    { module: "ET0744", week: 2, adm: 2500003, ats: 0 },
    { module: "ET0744", week: 2, adm: 2500004, ats: 1 },
    { module: "ET0744", week: 2, adm: 2500005, ats: 1 },
    { module: "ET0744", week: 2, adm: 2500006, ats: 1 },
    { module: "ET0744", week: 3, adm: 2500001, ats: 1 },
    { module: "ET0744", week: 3, adm: 2500002, ats: 1 },
    { module: "ET0744", week: 3, adm: 2500003, ats: 0 },
    { module: "ET0744", week: 3, adm: 2500004, ats: 1 },
    { module: "ET0744", week: 3, adm: 2500005, ats: 1 },
    { module: "ET0744", week: 3, adm: 2500006, ats: 1 },
    { module: "ET0744", week: 4, adm: 2500001, ats: 1 },
    { module: "ET0744", week: 4, adm: 2500002, ats: 1 },
    { module: "ET0744", week: 4, adm: 2500003, ats: 1 },
    { module: "ET0744", week: 4, adm: 2500004, ats: 0 },
    { module: "ET0744", week: 4, adm: 2500005, ats: 1 },
    { module: "ET0744", week: 4, adm: 2500006, ats: 1 },
    { module: "ET0744", week: 5, adm: 2500001, ats: 0 },
    { module: "ET0744", week: 5, adm: 2500002, ats: 0 },
    { module: "ET0744", week: 5, adm: 2500003, ats: 0 },
    { module: "ET0744", week: 5, adm: 2500004, ats: 0 },
    { module: "ET0744", week: 5, adm: 2500005, ats: 0 },
    { module: "ET0744", week: 5, adm: 2500006, ats: 0 }
]);
```

---

## 6. Update week 5

`updateMany` (or `updateOne`) with a filter and a `$set`. Fix the three that changed:

```js
await cls.updateOne({ week: 5, adm: 2500003 }, { $set: { ats: 1 } });
await cls.updateOne({ week: 5, adm: 2500004 }, { $set: { ats: 1 } });
await cls.updateOne({ week: 5, adm: 2500005 }, { $set: { ats: 1 } });
await cls.updateOne({ week: 5, adm: 2500006 }, { $set: { ats: 1 } });
```

- First arg = **which** documents (the filter, like SQL's WHERE).
- Second arg = **what** to change, always with an update operator like `$set`. Forgetting `$set` and passing a bare object would *replace the whole document* - a nasty bug.

---

## 7. Task A - join class with students ($lookup)

Mongo's join lives in the **aggregation pipeline** via `$lookup`. A pipeline is an array of stages, each transforming the stream:

```js
const joined = await cls.aggregate([
    {
        $lookup: {
            from: "students",       // the other collection
            localField: "adm",      // match this field in class...
            foreignField: "adm",    // ...to this field in students
            as: "student"           // attach matches under this name
        }
    },
    { $unwind: "$student" }          // flatten the 1-element array into an object
]).toArray();

console.log(joined);
```

- `$lookup` attaches matching student docs as an **array** field called `student`.
- `$unwind` unpacks that single-element array into a plain sub-object, so each row reads cleanly. Without it you get `student: [ {...} ]`.

---

## 8. Task B - one student

```js
const emily = await students.find({ adm: 2500002 }).toArray();
console.log(emily);
```

The filter object `{ adm: 2500002 }` is the equivalent of `WHERE adm = 2500002`.

---

## 9. Task C - email of Jessica

Filter by name, and **project** just the email (second arg to `find`):

```js
const jessica = await students
    .find({ name: "Jessica" }, { projection: { email: 1, _id: 0 } })
    .toArray();
console.log(jessica);        // [ { email: 'jessica@sp.edu' } ]
```

`projection: { email: 1, _id: 0 }` = "include email, exclude the default `_id`." That's how you return one field, like `SELECT email`.

---

## 10. Task D - attendance count per student ($group)

The aggregation version of `COUNT ... GROUP BY adm`. `$match` filters (like WHERE), `$group` buckets and sums:

```js
const counts = await cls.aggregate([
    { $match: { ats: 1 } },                       // only attended rows
    { $group: {
        _id: "$adm",                              // group by adm
        attendance: { $sum: "$ats" }              // sum the 1s = attended count
    }}
]).toArray();

console.log(counts);
```

- **`$match: { ats: 1 }`** drops absences before counting - same job as `WHERE ats = 1`.
- **`$group`**: `_id` is the group key (`$adm`), and `attendance` accumulates. `{ $sum: "$ats" }` adds up the `ats` values (all 1s after the match), or use `{ $sum: 1 }` to count rows. Same result here.
- Output: one object per student with their attended total (2500005 → 5, the perfect one).

> The pattern mirrors SQL exactly: **`$match` = WHERE, `$group` = GROUP BY, `$sum` = COUNT/SUM, `$lookup` = JOIN.** Learn the four `$` stages and Mongo aggregation stops being scary.

---

## 11. Printing it "like the MySQL output"

The practical wants `console.log` output resembling the SQL grid. `console.table` makes it tabular:

```js
console.table(counts);       // prints a neat ASCII table in the terminal
```

Nice for the "print output similar to MySQL" tasks - it lines the fields up in columns.

---

## 12. Mistakes that bite

- **`console.log` shows a Promise / undefined** → you forgot `await`, or you're logging outside the `async` function before it finished.
- **Script hangs and never exits** → you didn't `await client.close()`, or an error skipped it. Wrap in `try/finally` if you want it bulletproof.
- **Duplicate data** → you ran the insert twice. Clear with `deleteMany({})` or drop the collection in Compass.
- **`update` wiped a document's other fields** → you passed a bare object instead of `{ $set: {...} }`.
- **`ECONNREFUSED 27017`** → MongoDB server isn't running. Start the service / open Compass to confirm it connects.

---

## 13. Recap flashcards

- `new MongoClient("mongodb://localhost:27017")`, `await client.connect()`, `db.collection(name)`, `await client.close()`. Everything is `await`ed inside an `async` function.
- `insertMany([docs])`, `find(filter).toArray()`, `deleteMany({ adm: { $gte: n } })`.
- Query operators are `$`-prefixed: `$gte`, `$gt`, `$lt`, `$eq`, `$ne`.
- `updateOne(filter, { $set: {...} })` - filter picks the doc, `$set` changes fields. Never a bare object.
- Aggregation stages: **`$match`=WHERE, `$group`=GROUP BY, `$sum`=COUNT, `$lookup`=JOIN** (+`$unwind` to flatten).
- Projection `{ field: 1, _id: 0 }` = SELECT specific columns. `console.table()` for tidy output.

Next: the main event. The Sample Lab Test, rebuilt from an empty folder. →
