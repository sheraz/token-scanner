const express = require('express');
const cors = require('cors');
const tokensRouter = require('./routes/tokens');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Mount the tokens router
app.use('/tokens', tokensRouter);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});