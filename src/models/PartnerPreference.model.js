const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./User.model');

const PartnerPreference = sequelize.define(
  'PartnerPreference',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    accountId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: 'users',
        key: 'accountId',
      },
      onDelete: 'CASCADE',
    },
    ageMin: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 18, max: 100 },
    },
    ageMax: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 18, max: 100 },
    },
    heightMin: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    heightMax: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    religions: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of preferred religions',
    },
    castes: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of preferred castes',
    },
    willingToMarryFromAnyCaste: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    educations: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of preferred education levels',
    },
    occupations: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of preferred occupations',
    },
    incomeMin: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    incomeMax: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    locations: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of preferred locations (city/state/country objects)',
    },
    maritalStatuses: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of acceptable marital statuses',
    },
    dosham: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Dosham preference: "Yes", "No", "Does not matter"',
    },
    diet: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Diet preference: "Vegetarian", "Non-Vegetarian", "Does not matter"',
    },
  },
  {
    tableName: 'partner_preferences',
    timestamps: true,
  }
);

// Define associations
User.hasOne(PartnerPreference, { foreignKey: 'accountId', sourceKey: 'accountId', as: 'partnerPreference' });
PartnerPreference.belongsTo(User, { foreignKey: 'accountId', targetKey: 'accountId', as: 'user' });

module.exports = PartnerPreference;
