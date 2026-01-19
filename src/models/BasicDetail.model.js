const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./User.model');

const BasicDetail = sequelize.define(
  'BasicDetail',
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
    dateOfBirth: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    height: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    physicalStatus: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    maritalStatus: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    religion: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    caste: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    subcaste: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    willingToMarryFromAnyCaste: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    dosham: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    country: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    state: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    education: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    employmentType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    occupation: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    currency: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    annualIncome: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    familyStatus: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    familyType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    familyValues: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    aboutFamily: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    pincode: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    district: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    profileverified: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      comment: 'Profile verification status: 0 = unverified, 1 = verified, 2 = rejected',
    },
    proofverified: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      comment: 'Proof document verification status: 0 = unverified, 1 = verified, 2 = rejected',
    },
  },
  {
    tableName: 'basic_details',
    timestamps: true,
  }
);

User.hasOne(BasicDetail, { foreignKey: 'accountId', sourceKey: 'accountId', as: 'basicDetail' });
BasicDetail.belongsTo(User, { foreignKey: 'accountId', targetKey: 'accountId', as: 'user' });

module.exports = BasicDetail;


