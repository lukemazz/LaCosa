// backend/models/Game.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const playerSchema = new Schema({
  username: { type: String, required: true },
  role: { type: String, enum: ['Umano', 'La Cosa'], default: '' },
  hand: { type: Array, default: [] }
});

const gameSchema = new Schema({
  name: { type: String, required: true },
  players: [playerSchema],
  deck: { type: Array, default: [] },
  discardPile: { type: Array, default: [] },
  state: { type: Object, default: { currentTurn: 0, baseHealth: 0 } },
  status: { type: String, enum: ['waiting', 'in-progress', 'finished'], default: 'waiting' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Game', gameSchema);
