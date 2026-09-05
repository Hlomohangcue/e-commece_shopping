const dotenv = require('dotenv');

dotenv.config({
  path: require('path').resolve(__dirname, '../../.env'),
  override: true,
});
dotenv.config({
  path: require('path').resolve(__dirname, '../.env'),
  override: true,
});

const app = require('./app').default;

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Backend API listening on http://localhost:${PORT}`);
});
