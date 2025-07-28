const mongoose = require('mongoose');

const newsSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  summary: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  content: {
    type: String,
    default: ''
  },
  source: {
    type: String,
    required: true,
    trim: true
  },
  url: {
    type: String,
    required: true,
    unique: true
  },
  image: {
    type: String,
    default: null
  },
  category: {
    type: String,
    required: true,
    enum: ['politics', 'technology', 'business', 'sports', 'entertainment', 'health', 'science', 'world', 'general'],
    default: 'general'
  },
  publishedAt: {
    type: Date,
    required: true
  },
  fetchedAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  sourceHash: {
    type: String,
    required: true,
    index: true
  },
  contentSimilarity: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});
// Indexes for performance
newsSchema.index({ publishedAt: -1 });
newsSchema.index({ category: 1, publishedAt: -1 });
newsSchema.index({ source: 1, publishedAt: -1 });
newsSchema.index({ sourceHash: 1 });

// Virtual for age calculation
newsSchema.virtual('age').get(function() {
  return Date.now() - this.publishedAt.getTime();
});

module.exports = mongoose.model('News', newsSchema);