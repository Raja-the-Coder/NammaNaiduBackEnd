const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SuccessStory = sequelize.define(
  'SuccessStory',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    groomName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    brideName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    subcaste: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    marriedYear: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    story: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    photoUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    rating: {
      type: DataTypes.INTEGER,
      defaultValue: 5,
    },
    isPublished: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    displayOrder: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  },
  {
    tableName: 'success_stories',
    timestamps: true,
  }
);

module.exports = SuccessStory;
