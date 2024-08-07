const express = require('express');
const app = express();
const jwt = require('jsonwebtoken');
const cors = require('cors');
const port = process.env.PORT || 5000;
const stripe = require('stripe')('sk_test_51PQkr9DcLfNezDuzuWKNPJwUZJIzczctBEH8zegqpcwvkJdNqLjGOkAF9R0NzDCYI9JxqsqSTiYlpozFw7NCyQij00VYwyY2EQ');
require('dotenv').config();

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ej6qyrh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

if (!process.env.DB_USER || !process.env.DB_PASS || !process.env.ACCESS_TOKEN_SECRET) {
  throw new Error('Missing necessary environment variables');
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // await client.connect();

    const productCollection = client.db('travel_kit').collection('products');
    const reviewsCollection = client.db('travel_kit').collection('reviews');
    const cartCollection = client.db('travel_kit').collection('carts');
    const userCollection = client.db('travel_kit').collection('users');
    const paymentCollection = client.db('travel_kit').collection('payments');

    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    });

    // middlewares 
    const verifyToken = (req, res, next) => {
      const authorizationHeader = req.headers.authorization;
      if (!authorizationHeader) {
        return res.status(401).send({ message: 'Unauthorized access' });
      }
      const token = authorizationHeader.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'Unauthorized access' });
        }
        req.decoded = decoded;
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      next();
    };

    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      res.send({ admin: user?.role === 'admin' });
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'User already exists', insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);
      const query = { _id: { $in: payment.cartIds.map(id => new ObjectId(id)) } };
      const deleteResult = await cartCollection.deleteMany(query);
      res.status(200).send({ paymentResult, deleteResult });
    });

    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = { $set: { role: 'admin' } };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    app.get('/products', async (req, res) => {
      try {
        const result = await productCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    app.get('/payments', async (req, res) => {
      try {
        const result = await paymentCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    app.get('/products/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productCollection.findOne(query);
      res.send(result);
    });

    app.patch('/products/:id', async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = { $set: item };
      const result = await productCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.post('/products', verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await productCollection.insertOne(item);
      res.send(result);
    });

    app.post('/reviews', async (req, res) => {
      const item = req.body;
      const result = await reviewsCollection.insertOne(item);
      res.send(result);
    });

    app.get('/reviews', async (req, res) => {
      try {
        const result = await reviewsCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    app.get('/reviews/:reviewerName', async (req, res) => {
      const { reviewerName } = req.params;
      try {
        const userReviews = await reviewsCollection.find({ reviewerName }).toArray();
        res.json(userReviews);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });

    app.get('/payments/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const query = { email: email };
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    app.get('/carts', async (req, res) => {
      try {
        const email = req.query.email;
        const query = { email: email };
        const result = await cartCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    app.delete('/carts/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await cartCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    app.delete('/products/:id', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await productCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    app.post('/carts', async (req, res) => {
      try {
        const cartItem = req.body;
        const result = await cartCollection.insertOne(cartItem);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    //Stats or Analysis
    app.get('/admin-stats', async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const products = await productCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();
      const payments = await paymentCollection.find().toArray();
      const revenue = payments.reduce((total, payment) => total + payment.price, 0);
      res.send({ users, products, orders, revenue });
    });

    app.patch('/payments/:id/accept', async (req, res) => {
      const paymentId = req.params.id;

      try {
        const filter = { _id: new ObjectId(paymentId) };
        const updateDoc = {
          $set: {
            status: 'accepted'
          }
        };

        const result = await paymentCollection.updateOne(filter, updateDoc);

        if (result.modifiedCount === 1) {
          res.status(200).send({ message: 'Payment accepted successfully.' });
        } else {
          res.status(404).send({ message: 'Payment not found.' });
        }
      } catch (error) {
        console.error('Error accepting payment:', error);
        res.status(500).send({ message: 'Internal Server Error.' });
      }
    });


    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");

  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Travel Kit is running');
});

app.listen(port, () => {
  console.log(`Travel Kit is running on port ${port}`);
});
