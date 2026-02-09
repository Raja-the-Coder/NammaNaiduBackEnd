const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./User.model');

const DailyRecommendation = sequelize.define(
  'DailyRecommendation',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    accountId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'accountId' },
      onDelete: 'CASCADE',
      comment: 'The user who receives the recommendation',
    },
    recommendedAccountId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'accountId' },
      onDelete: 'CASCADE',
      comment: 'The recommended user',
    },
    score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Compatibility score 0-100',
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Short text explaining why recommended (e.g. "Matches your age, religion, and caste preferences")',
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: 'Date this recommendation was generated for',
    },
    seen: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether user has viewed this recommendation',
    },
    actionTaken: {
      type: DataTypes.ENUM('none', 'interest', 'shortlist', 'reject', 'skipped'),
      defaultValue: 'none',
      comment: 'What action the user took on this recommendation',
    },
  },
  {
    tableName: 'daily_recommendations',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['accountId', 'recommendedAccountId', 'date'],
        name: 'unique_daily_rec',
      },
      { fields: ['accountId', 'date'] },
      { fields: ['date'] },
      { fields: ['score'] },
      { fields: ['seen'] },
    ],
  }
);

// Associations
DailyRecommendation.belongsTo(User, { foreignKey: 'accountId', targetKey: 'accountId', as: 'user' });
DailyRecommendation.belongsTo(User, { foreignKey: 'recommendedAccountId', targetKey: 'accountId', as: 'recommendedUser' });

module.exports = DailyRecommendation;
