#!/usr/bin/env node

/**
 * Database Seed Script
 * Seeds the database with sample data for development and testing
 *
 * Usage: npm run db:seed
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech')
    ? { rejectUnauthorized: false }
    : false,
});

const sampleCustomers = [
  {
    name: 'John Developer',
    email: 'john@example.com',
    company: 'Acme Corp',
    use_case: 'Building a SaaS product',
    referral_source: 'Twitter',
    newsletter_opted_in: true,
    github_username: 'johndeveloper',
    github_user_id: 12345,
    polar_order_id: 'order_test_001',
    polar_customer_id: 'cust_test_001',
    amount_paid: 9900,
    currency: 'usd',
    status: 'active',
  },
  {
    name: 'Jane Engineer',
    email: 'jane@example.com',
    company: 'StartupXYZ',
    use_case: 'Internal tools',
    referral_source: 'Product Hunt',
    newsletter_opted_in: false,
    github_username: 'janeengineer',
    github_user_id: 67890,
    polar_order_id: 'order_test_002',
    polar_customer_id: 'cust_test_002',
    amount_paid: 4900,
    currency: 'usd',
    status: 'active',
  },
  {
    name: 'Bob Builder',
    email: 'bob@example.com',
    company: null,
    use_case: 'Side project',
    referral_source: 'Google',
    newsletter_opted_in: true,
    github_username: 'bobbuilder',
    github_user_id: 11111,
    polar_order_id: 'order_test_003',
    polar_customer_id: 'cust_test_003',
    amount_paid: 9900,
    currency: 'usd',
    status: 'invited',
  },
];

async function seed() {
  console.log('Seeding database...');

  try {
    // Clear existing data (development only!)
    if (process.env.NODE_ENV !== 'production') {
      console.log('Clearing existing data...');
      await pool.query('DELETE FROM oauth_sessions');
      await pool.query('DELETE FROM customers');
    }

    // Insert sample customers
    for (const customer of sampleCustomers) {
      const query = `
        INSERT INTO customers (
          name, email, company, use_case, referral_source,
          newsletter_opted_in, github_username, github_user_id,
          polar_order_id, polar_customer_id, amount_paid, currency, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (polar_order_id) DO NOTHING
        RETURNING id;
      `;

      const values = [
        customer.name,
        customer.email,
        customer.company,
        customer.use_case,
        customer.referral_source,
        customer.newsletter_opted_in,
        customer.github_username,
        customer.github_user_id,
        customer.polar_order_id,
        customer.polar_customer_id,
        customer.amount_paid,
        customer.currency,
        customer.status,
      ];

      const result = await pool.query(query, values);
      if (result.rows.length > 0) {
        console.log(`  Created customer: ${customer.name} (${customer.email})`);
      } else {
        console.log(`  Skipped (exists): ${customer.name} (${customer.email})`);
      }
    }

    console.log('');
    console.log('Seed completed successfully!');
    console.log(`  Customers created: ${sampleCustomers.length}`);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
