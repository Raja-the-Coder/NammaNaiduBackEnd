const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Notification = sequelize.define('Notification', {
    id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    userId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'The user who receives the notification',
        references: {
            model: 'users',
            key: 'accountId'
        }
    },
    senderId: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'The user who triggered the notification',
        references: {
            model: 'users',
            key: 'accountId'
        }
    },
    type: {
        type: DataTypes.ENUM('interest_received', 'interest_accepted', 'profile_viewed', 'shortlisted', 'system'),
        allowNull: false,
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    isRead: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    relatedId: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Generic field for related IDs (e.g. actionId)'
    },
    imageUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Image URL to display in push notification and in-app',
    }
}, {
    timestamps: true,
    tableName: 'notifications',
});

const User = require('./User.model');

User.hasMany(Notification, { foreignKey: 'userId', sourceKey: 'accountId', as: 'receivedNotifications' });
User.hasMany(Notification, { foreignKey: 'senderId', sourceKey: 'accountId', as: 'sentNotifications' });
Notification.belongsTo(User, { foreignKey: 'userId', targetKey: 'accountId', as: 'recipient' });
Notification.belongsTo(User, { foreignKey: 'senderId', targetKey: 'accountId', as: 'sender' });

module.exports = Notification;
