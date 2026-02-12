const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Please provide a name',
        },
      },
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      validate: {
        isEmail: {
          msg: 'Please provide a valid email',
        },
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        len: {
          args: [6, 100],
          msg: 'Password must be at least 6 characters',
        },
      },
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: {
          msg: 'Please provide a phone number',
        },
      },
    },
    countryCode: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '+91',
    },
    gender: {
      type: DataTypes.ENUM('Male', 'Female', 'Other'),
      allowNull: true,
    },
    profileFor: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dateOfBirth: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    accountId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      defaultValue: () => uuidv4(),
    },
    userCode: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      defaultValue: 'NN#00001',
    },
    role: {
      type: DataTypes.ENUM('user', 'admin'),
      defaultValue: 'user',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    otpVerifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    totalprofileview: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    profileveriffied: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    profileViewTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    profileStatus: {
      type: DataTypes.ENUM('draft', 'submitted', 'approved', 'rejected'),
      defaultValue: 'draft',
      comment: 'Profile status: draft (incomplete), submitted (pending review), approved, rejected',
    },
    profileVisibility: {
      type: DataTypes.ENUM('public', 'members', 'hidden'),
      defaultValue: 'members',
      comment: 'Profile visibility: public (everyone), members (logged-in users), hidden (not shown)',
    },
    profileCompletionPct: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      comment: 'Cached profile completion percentage (0-100)',
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'users',
    timestamps: true,
    paranoid: true, // Enables soft delete via deletedAt column
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }

        if (!user.accountId) {
          user.accountId = uuidv4();
        }

        // Always generate a unique userCode for every new user
        try {
          const nextCode = await generateUserCode();
          user.userCode = nextCode || `NN#${String(Date.now()).slice(-5)}`;
        } catch (error) {
          console.error('Error generating userCode:', error);
          // Fallback to timestamp-based code to avoid unique constraint conflicts
          user.userCode = `NN#${String(Date.now()).slice(-5)}`;
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password') && user.password) {
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
    },
  }
);

async function generateUserCode() {
  try {
    const lastUser = await User.findOne({
      order: [['id', 'DESC']],
      attributes: ['userCode', 'id'],
      where: {
        userCode: {
          [Op.ne]: null
        }
      }
    });

    if (!lastUser || !lastUser.userCode) {
      return 'NN#00001';
    }

    const match = lastUser.userCode.match(/(\d+)$/);
    if (!match) {
      return 'NN#00001';
    }

    const currentNumber = parseInt(match[1], 10);
    if (isNaN(currentNumber)) {
      return 'NN#00001';
    }

    const nextNumber = currentNumber + 1;
    return `NN#${String(nextNumber).padStart(5, '0')}`;
  } catch (error) {
    console.error('Error in generateUserCode:', error);
    // Return default code on error
    return 'NN#00001';
  }
}

// Instance method to compare password
User.prototype.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to exclude password from JSON
User.prototype.toJSON = function () {
  const values = { ...this.get() };
  delete values.password;
  return values;
};

module.exports = User;
