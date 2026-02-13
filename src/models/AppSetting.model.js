const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AppSetting = sequelize.define(
  'AppSetting',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    key: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: 'app_settings',
    timestamps: true,
    indexes: [{ unique: true, fields: ['key'] }],
  }
);

module.exports = AppSetting;
