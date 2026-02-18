/**
 * Migration script to add perceptual hash columns to person_photos table.
 * Run with: node run-migration-photo-hashes.js
 */
const { sequelize } = require('./src/config/database');

async function migrate() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Connected.');

    const queryInterface = sequelize.getQueryInterface();

    const columns = ['photo1Hash', 'photo2Hash', 'photo3Hash', 'photo4Hash', 'photo5Hash'];

    for (const col of columns) {
      try {
        await queryInterface.addColumn('person_photos', col, {
          type: require('sequelize').DataTypes.STRING(64),
          allowNull: true,
        });
        console.log(`Added column: ${col}`);
      } catch (err) {
        if (err.message.includes('already exists') || err.original?.code === '42701') {
          console.log(`Column ${col} already exists, skipping.`);
        } else {
          throw err;
        }
      }
    }

    console.log('Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
