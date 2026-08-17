const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/veriverse').then(async () => {
  const result = await mongoose.connection.db.collection('users').updateOne(
    { username: 'admin' },
    { $set: { role: 'expert', expertCategory: 'health' } }
  );
  console.log('Matched:', result.matchedCount, 'Modified:', result.modifiedCount);
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
