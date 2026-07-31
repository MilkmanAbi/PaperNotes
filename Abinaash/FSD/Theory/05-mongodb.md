---
title: MongoDB — The Database
emoji: 🍃(˘ᵕ˘)
order: 5
blurb: NoSQL vs SQL, documents & collections, BSON, CRUD in the shell, query operators, aggregation, indexes, and Atlas. The 'M' in MERN.
---

# MongoDB — The Database 🍃(˘ᵕ˘)

> A note on the name: "Mongo" is from *humongous*. It's a database built for big, flexible, JSON-shaped data. The other three MERN letters all speak JSON natively, and Mongo stores JSON-ish documents, so the whole stack fits together with almost no translation layer.

MongoDB is a **NoSQL, document database**. This chapter is the database *itself* — the concepts and the query language. Chapter 06 (Mongoose) is the nicer JavaScript layer you'll actually write most code against, but you should understand what's underneath first.

---

## 1. SQL vs NoSQL — the big picture

The database world has two broad families:

**Relational (SQL)** — MySQL, PostgreSQL, SQL Server. Data lives in **tables** with fixed **columns** and **rows**. Every row in a table has the same shape (schema). Relationships are modelled by splitting data across tables and *joining* them. Strong consistency, rigid structure, decades of tooling.

**Document (NoSQL)** — MongoDB. Data lives in **collections** of **documents**. Each document is a flexible, JSON-like object. Documents in the same collection *can* have different fields. Related data is often *embedded* inside one document instead of joined across tables. Flexible, fast to iterate, scales horizontally.

| SQL term | MongoDB term |
|---|---|
| database | database |
| table | **collection** |
| row / record | **document** |
| column / field | **field** |
| primary key | **`_id`** |
| JOIN | embed, or `$lookup` / `populate` |
| schema (enforced) | flexible (schema optional; Mongoose adds one) |

Neither is "better" — they fit different problems. MERN uses Mongo because JSON-shaped documents map perfectly onto JavaScript objects and onto the JSON your API sends. You store almost exactly what your app already has in memory.

---

## 2. Documents, collections, BSON

A **document** is a set of key/value pairs — looks like a JS object:

```js
{
  "_id": ObjectId("665f1a2b3c4d5e6f7a8b9c0d"),
  "title": "Buy graph paper",
  "done": false,
  "tags": ["shopping", "stationery"],
  "author": { "name": "Abi", "handle": "MilkmanAbi" },  // nested object
  "createdAt": ISODate("2026-07-28T09:00:00Z")
}
```

- A **collection** is a group of documents (like a table, but flexible). Notes live in a `notes` collection.
- **`_id`** — every document gets a unique primary key automatically. By default it's an **`ObjectId`**: a 12-byte value that's unique and encodes a creation timestamp. You rarely set it yourself; Mongo generates it.
- **BSON** — Mongo doesn't literally store text JSON; it stores **BSON** (Binary JSON). BSON adds types JSON lacks — real dates (`ISODate`), `ObjectId`, binary, and distinct int/double — and is faster to traverse. You *think* in JSON; Mongo stores BSON. That's why a Mongo date isn't just a string.

The flexibility ("documents can differ") is powerful but a double-edged sword: nothing *stops* you from having `title` in one doc and `titel` in another. That's precisely the discipline **Mongoose** adds back with schemas (next chapter).

---

## 3. Getting a database: Atlas vs local

- **MongoDB Atlas** — the official cloud-hosted MongoDB, with a free tier ("M0"). For coursework this is usually the easiest: sign up, create a free cluster, get a **connection string** (`mongodb+srv://user:pass@cluster.../dbname`), and connect from anywhere. This is what you'll put in `MONGODB_URI` in your `.env`.
- **Local install** — run `mongod` on your own machine. More setup, works offline, connection string is `mongodb://localhost:27017/dbname`.
- **`mongosh`** — the MongoDB Shell, a command-line REPL for talking to a database directly. Great for learning and debugging.
- **MongoDB Compass** — the official GUI. Browse collections, run queries visually, see documents. Genuinely useful for checking "did my POST actually save?"

For the theory below, imagine typing into `mongosh`. In your app you'll issue the *same operations* through Mongoose.

---

## 4. CRUD in the shell

Assume a `notes` collection. In `mongosh`, `db.notes` is that collection.

**Create** — `insertOne`, `insertMany`:

```js
db.notes.insertOne({ title: "First", done: false, tags: ["a"] })
db.notes.insertMany([{ title: "Two" }, { title: "Three", done: true }])
```

**Read** — `find` (many), `findOne` (one). Empty filter `{}` = everything:

```js
db.notes.find()                          // all documents
db.notes.find({ done: false })           // where done is false
db.notes.findOne({ title: "First" })     // first match only
db.notes.find({}, { title: 1, _id: 0 })  // projection: only title, hide _id
db.notes.find().sort({ createdAt: -1 }).limit(5)  // 5 most recent
```

**Update** — `updateOne`, `updateMany`. You need a *filter* and an *update operator* like `$set`:

```js
db.notes.updateOne(
  { title: "First" },                    // which document(s)
  { $set: { done: true } }               // what to change
)
db.notes.updateMany({ done: false }, { $set: { done: true } })  // mark all done
```

**Delete** — `deleteOne`, `deleteMany`:

```js
db.notes.deleteOne({ title: "First" })
db.notes.deleteMany({ done: true })      // delete all completed
db.notes.deleteMany({})                  // ⚠️ deletes EVERYTHING in the collection
```

Notice the shape: `db.<collection>.<operation>(<filter>, <update/options>)`. Every CRUD call fits it.

---

## 5. Query operators — filtering like you mean it

A filter `{ done: false }` matches exact equality. For anything richer, use **operators** (they start with `$`):

**Comparison:**
```js
db.notes.find({ priority: { $gt: 3 } })         // greater than 3
db.notes.find({ priority: { $gte: 3, $lte: 5 } }) // between 3 and 5
db.notes.find({ status: { $ne: "archived" } })  // not equal
db.notes.find({ status: { $in: ["open", "wip"] } }) // in a list
db.notes.find({ status: { $nin: ["done"] } })   // not in a list
```

**Logical:**
```js
db.notes.find({ $and: [{ done: false }, { priority: { $gt: 2 } }] })
db.notes.find({ $or: [{ done: true }, { archived: true }] })
```

**Existence / type / arrays:**
```js
db.notes.find({ dueDate: { $exists: true } })   // field is present
db.notes.find({ tags: "shopping" })             // array CONTAINS this value
db.notes.find({ tags: { $all: ["a", "b"] } })   // array contains all of these
db.notes.find({ title: { $regex: /paper/i } })  // text match (i = case-insensitive)
```

Operators are exactly the language you'll pass to Mongoose's `.find()` too — same operators, same syntax. Learn them once, use them in both places.

---

## 6. Aggregation — the power tool (know it exists)

`find` gets documents. **Aggregation** *transforms* them through a **pipeline** of stages — grouping, computing, reshaping. It's Mongo's version of SQL's `GROUP BY` + more. You may not need it for a basic CRUD project, but you should recognise it.

```js
db.orders.aggregate([
  { $match: { status: "completed" } },          // 1. filter (like find)
  { $group: {                                    // 2. group + compute
      _id: "$customerId",
      total: { $sum: "$amount" },
      count: { $sum: 1 }
  }},
  { $sort: { total: -1 } },                       // 3. sort
  { $limit: 10 }                                  // 4. top 10
])
```

Each stage takes the previous stage's output as input — a conveyor belt. Common stages: `$match` (filter), `$group` (aggregate), `$sort`, `$limit`, `$project` (reshape fields), `$lookup` (join another collection — the closest thing Mongo has to a SQL JOIN). If your project needs "total spend per user" or "count of notes per tag," this is the tool.

---

## 7. Indexes — why your app stays fast

By default, a query scans *every document* in the collection to find matches (a "collection scan"). Fine for 10 documents, catastrophic for a million. An **index** is a sorted lookup structure on a field that lets Mongo jump straight to matches — like the index at the back of a textbook instead of reading every page.

```js
db.notes.createIndex({ title: 1 })          // ascending index on title
db.notes.createIndex({ author: 1, createdAt: -1 })  // compound index
db.users.createIndex({ email: 1 }, { unique: true }) // enforce uniqueness too
```

Key points:
- **`_id` is always indexed.** Lookups by `_id` are already fast.
- Index the fields you *frequently filter or sort by* (e.g. `email` on users, because you look users up by email on login).
- Indexes cost write speed and storage (they must be updated on every insert/update) — so index what you query, not everything.
- A `unique: true` index is how you enforce "no two users with the same email" at the database level.

You set these up in Mongoose via the schema (chapter 06), but the concept is pure MongoDB.

---

## 8. Modelling relationships — embed or reference?

The big design decision in Mongo: when data is related, do you **embed** it or **reference** it?

**Embed** — nest the related data inside the parent document:
```js
{ _id: 1, title: "Trip", comments: [
    { author: "Abi", text: "nice" },
    { author: "Sam", text: "when?" }
]}
```
Good when the nested data *belongs to* the parent, is read together, and doesn't grow unbounded. One read gets everything — fast. Downside: duplication, and documents have a 16MB size cap.

**Reference** — store the related document's `_id` and look it up separately:
```js
{ _id: 1, title: "Trip", authorId: ObjectId("...") }   // points to a users doc
```
Good when the related data is large, shared across many parents, or changes independently. You "join" it back with `$lookup` (or Mongoose's `populate`). Downside: extra queries.

Rule of thumb: **embed data that's read together and owned by one parent; reference data that's shared or independent.** A note's tags → embed. A note's *author* (a full user who has many notes) → reference. You'll implement referencing with `ref` + `populate` in the next chapter.

---

## Recap flashcards

- Mongo = NoSQL document DB. table→collection, row→document, PK→`_id`.
- Documents are flexible JSON-ish objects; stored as BSON (adds real dates, ObjectId, types).
- Atlas = free cloud Mongo; connection string goes in `.env` as `MONGODB_URI`.
- CRUD: `insertOne/Many`, `find/findOne`, `updateOne/Many` (with `$set`), `deleteOne/Many`.
- Filters use `$` operators: `$gt/$lt/$in/$or/$exists/$regex`, arrays match by containment.
- Aggregation = a pipeline of stages (`$match`, `$group`, `$sort`, `$lookup`) for reshaping/reporting.
- Indexes make queries fast; index what you filter/sort by; `unique: true` enforces no-dupes.
- Relationships: embed (owned, read-together) vs reference (shared, independent).

Next: Mongoose, which puts a friendly, safe JavaScript layer over all of this. →
