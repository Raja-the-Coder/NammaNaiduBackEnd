const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./User.model');

const ProfileView = sequelize.define(
  'ProfileView',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    viewerId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'accountId',
      },
      onDelete: 'CASCADE',
      comment: 'UUID of the user who viewed the profile',
    },
    viewedUserId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'accountId',
      },
      onDelete: 'CASCADE',
      comment: 'UUID of the user whose profile was viewed',
    },
  },
  {
    tableName: 'profile_views',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['viewerId', 'viewedUserId'],
        name: 'unique_viewer_viewed',
      },
      {
        fields: ['viewerId'],
      },
      {
        fields: ['viewedUserId'],
      },
    ],
  }
);

// Define associations
ProfileView.belongsTo(User, {
  foreignKey: 'viewerId',
  targetKey: 'accountId',
  as: 'viewer',
});

ProfileView.belongsTo(User, {
  foreignKey: 'viewedUserId',
  targetKey: 'accountId',
  as: 'viewedUser',
});

module.exports = ProfileView;
