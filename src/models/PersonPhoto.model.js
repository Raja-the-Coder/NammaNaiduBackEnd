const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./User.model');

const PersonPhoto = sequelize.define(
  'PersonPhoto',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    personId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'accountId',
      },
      onDelete: 'CASCADE',
    },
    photo1: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Cloudinary URL for photo placement 1',
    },
    photo2: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Cloudinary URL for photo placement 2',
    },
    photo3: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Cloudinary URL for photo placement 3',
    },
    photo4: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Cloudinary URL for photo placement 4',
    },
    photo5: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Cloudinary URL for photo placement 5',
    },
    proofImage: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Cloudinary URL for proof image',
    },
    primaryPhoto: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: { min: 1, max: 5 },
      comment: 'Which photo slot (1-5) is the primary/display photo',
    },
    photoOrder: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '1,2,3,4,5',
      comment: 'Comma-separated display order of photos e.g. 3,1,2,4,5',
    },
    faceVerified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Whether admin has verified the face matches proof image',
    },
    photo1Hash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: 'Perceptual hash of photo1 for duplicate detection',
    },
    photo2Hash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: 'Perceptual hash of photo2 for duplicate detection',
    },
    photo3Hash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: 'Perceptual hash of photo3 for duplicate detection',
    },
    photo4Hash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: 'Perceptual hash of photo4 for duplicate detection',
    },
    photo5Hash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: 'Perceptual hash of photo5 for duplicate detection',
    },
  },
  {
    tableName: 'person_photos',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['personId'],
      },
    ],
  }
);

// Define associations
User.hasOne(PersonPhoto, { foreignKey: 'personId', sourceKey: 'accountId', as: 'personPhoto' });
PersonPhoto.belongsTo(User, { foreignKey: 'personId', targetKey: 'accountId', as: 'person' });

module.exports = PersonPhoto;
