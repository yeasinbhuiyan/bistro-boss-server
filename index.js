const express = require('express');
const app = express()
const cors = require('cors');
const port = process.env.PORT || 5000
const jwt = require('jsonwebtoken');
require('dotenv').config()

const stripe = require('stripe')(process.env.PAYMENT_SECRECT_KEY)

// middlewear  

const corsOptions = {
  origin: '*',
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())




const verifyJWT = (req, res, next) => {


  const authorization = req.headers.authorization



  if (!authorization) {

    return res.status(403).send({ error: true, message: 'unauthorization author' })

  }

  const token = authorization.split(' ')[1]


  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {


    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorization err' })
    }

    req.decoded = decoded

    next()

  });

}




const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.9xgdj4e.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const database = client.db("bistroDb");
    const menuCollection = database.collection("menu");
    const reviewsCollection = database.collection("reviews");
    const cartCollection = database.collection("carts");
    const usersCollection = database.collection("users");
    const paymentCollection = database.collection("payments");



    // verify admin 

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email
      const query = { email: email }
      const user = await usersCollection.findOne(query)
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'forbidden message' })
      }
      next()


    }






    //  jwt token method



    app.post('/jwt', (req, res) => {
      const user = req.body
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: '1hr'
      })

      res.send({ token })

    })





    // users method 


    /**
     * 0. do not show secure links to those who should not see the links 
     * 1. use jwt token : verifyJWT
     * 2 . use verifyAdmin middleWare 
     * 
     * 
     */

    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray()
      res.send(result)
    })




    app.post('/users', async (req, res) => {
      const user = req.body
      const query = { email: user.email }
      const existingUser = await usersCollection.findOne(query)
      if (existingUser) {
        return res.send({ message: 'user already exists' })
      }
      const result = await usersCollection.insertOne(user)
      res.send(result)
    })




    // security layer : verifyJWT 


    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email

      if (req.decoded.email !== email) {
        res.send({ admin: false })
      }
      const query = { email: email }
      const user = await usersCollection.findOne(query)
      const result = { admin: user?.role === 'admin' }
      res.send(result)
    })


    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc)
      res.send(result)

    })

    // menu method 
    app.get('/menu', async (req, res) => {
      const result = await menuCollection.find().toArray()
      // console.log(result)
      res.send(result)
    })


    app.post('/menu', verifyJWT, verifyAdmin, async (req, res) => {
      const newItem = req.body
      const result = await menuCollection.insertOne(newItem)
      res.send(result)
    })



    app.delete('/menu/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await menuCollection.deleteOne(query)
      res.send(result)
    })






    // review method 
    app.get('/reviews', async (req, res) => {
      const result = await reviewsCollection.find().toArray()
      // console.log(result)
      res.send(result)
    })



    // carts method 
    app.get('/carts', verifyJWT, async (req, res) => {



      const email = req.query.email
      const decodedEmail = req.decoded.email



      if (!email) {
        return res.send([])
      }

      if (email !== decodedEmail) {
        return res.status(401).send({ error: true, message: 'unauthorization email' })

      }
      const query = { email: email }

      const result = await cartCollection.find(query).toArray()
      res.send(result)
    })



    app.post('/carts', async (req, res) => {
      const item = req.body
      const result = await cartCollection.insertOne(item)
      res.send(result)
    })





    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await cartCollection.deleteOne(query)
      res.send(result)
    })





    // create payment intent 

    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100)
      console.log(amount)

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({ clientSecret: paymentIntent.client_secret })


    })


    // payments related api 

    app.post('/payments', verifyJWT, async (req, res) => {
      const payment = req.body
      const insertResult = await paymentCollection.insertOne(payment)
      const query = { _id: { $in: payment.cartItems.map(id => new ObjectId(id)) } }
      const deleteResult = await cartCollection.deleteMany(query)

      res.send({ insertResult, deleteResult })

    })


    //  stat

    app.get('/admin-stats', verifyJWT, verifyAdmin, async (req, res) => {
      const users = await usersCollection.estimatedDocumentCount()
      const menuItems = await menuCollection.estimatedDocumentCount()
      const orders = await paymentCollection.estimatedDocumentCount()
      const payments = await paymentCollection.find().toArray()
      const revenue = payments.reduce((sum, payment) => sum + payment.price, 0)
      res.send({ users, menuItems, orders, revenue })

    })




    app.get('/order-stats', verifyJWT, verifyAdmin, async (req, res) => {
      const pipeline = [

        {
          $lookup: {
            from: 'menu',
            localField: 'menuItems',
            foreignField: '_id',
            as: 'menuItemsData'
          }
        },
        {
          $unwind: '$menuItemsData'
        },
        {
          $group: {
            _id: '$menuItemsData.category',
            count: { $sum: 1 },
            totalPrice: { $sum: '$menuItemsData.price' }
          }
        }, {
          $project: {
            category: '$_id',
            count: 1,
            total: { $round: ['$totalPrice', 2] },
            _id: 0
          }
        }
      ];

      const result = await paymentCollection.aggregate(pipeline).toArray()
      res.send(result)
    })


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Boss is sitting')
})

app.listen(port, () => {
  console.log(`Boss are sitting on ${port}`)
})