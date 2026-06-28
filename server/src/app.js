const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const cartRoutes = require('./routes/cart.routes');
const categoryRoutes = require('./routes/category.routes');
const orderRoutes = require('./routes/order.routes');
const productRoutes = require('./routes/product.routes');
const { notFound, errorHandler } = require('./middlewares/error.middleware');

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'GreenHome API is running' });
  });
  app.use('/api/auth', authRoutes);
  app.use('/api', cartRoutes);
  app.use('/api', categoryRoutes);
  app.use('/api', orderRoutes);
  app.use('/api', productRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp,
};
