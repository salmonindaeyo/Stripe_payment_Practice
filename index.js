const cors = require("cors");
const express = require("express");
const mysql = require("mysql2/promise");
const { v4: uuidv4 } = require("uuid");
const bodyParser = require("body-parser");

require("dotenv").config();

const stripe = require("stripe")(
  "sk_test_51OZ8JFIHDBIOztVfMVIJDsZ7Ese8RNZsiSBJHYHjzFDEql8467jYJtNuDLBhHY47PSOjiyJgsPVPVIFghUKBf0SF008yxOspCa"
);

const app = express();
const port = 8000;

// This is your Stripe CLI webhook secret for testing your endpoint locally.
const endpointSecret =
  "whsec_7ba92a3b34add8ec1def29757a58de44a9ba031a899227892d232acc8a6d8f1f";

// Middlewares here
app.use(cors());

let conn = null;

const initMySQL = async () => {
  conn = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "Ntw171044.",
    database: "stripe",
    port: "3306",
  });
};

/* code ที่เขียนด้านล่างนี้จะเป็นการเพิ่มเติมส่วนจากตรงนี้ */

// Listen
app.listen(port, async () => {
  await initMySQL();
  console.log("Server started at port 8000");
});

app.get("/test", (req, res) => {
  console.log("test");
  res.json({ message: "test" });
});

app.post("/api/checkout", express.json(), async (req, res) => {
  const { user, product } = req.body;
  try {
    // create payment session
    const orderId = uuidv4();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "thb",
            product_data: {
              name: product.name,
            },
            unit_amount: product.price * 100,
          },
          quantity: product.quantity,
        },
      ],
      mode: "payment",
      success_url: `http://localhost:8888/success.html?id=${orderId}`,
      cancel_url: `http://localhost:8888/cancel.html?id=${orderId}`,
    });
    const orderData = {
      fullname: user.name,
      address: user.address,
      session_id: session.id,
      status: session.status,
      order_id: orderId,
    };
    console.log(session);
    const [result] = await conn.query("INSERT INTO orders SET ?", orderData);

    res.json({
      message: "Checkout success.",
      id: session.id,
      result,
    });
  } catch (error) {
    console.error("Error creating user:", error.message);
    res.status(400).json({ error: "Error payment" });
  }
});

app.get("/api/order/:id", async (req, res) => {
  const orderId = req.params.id;
  try {
    const [result] = await conn.query(
      "SELECT * from orders where order_id = ?",
      orderId
    );
    const selectedOrder = result[0];
    if (!selectedOrder) {
      throw {
        errorMessage: "Order not found",
      };
    }
    res.json(selectedOrder);
  } catch (error) {
    console.log("error", error);
    res.status(404).json({ error: error.errorMessage || "System error" });
  }
});

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    console.log("sadasdasd");
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    // Handle the event
    switch (event.type) {
      case "checkout.session.completed":
        const paymentSuccessData = event.data.object;
        const sessionId = paymentSuccessData.id;
        console.log(paymentSuccessData);

        const data = {
          status: paymentSuccessData.status,
        };

        const result = await conn.query(
          "UPDATE orders SET ? WHERE session_id = ?",
          [data, sessionId]
        );

        console.log("=== update result", result);

        // event.data.object.id = session.id
        // event.data.object.customer_details คือข้อมูลลูกค้า
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    res.send();
  }
);
