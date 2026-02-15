const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PageContent = sequelize.define(
  'PageContent',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    slug: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    metaDescription: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    isPublished: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    lastEditedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'page_contents',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['slug'] },
    ],
  }
);

module.exports = PageContent;
