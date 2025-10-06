// This script creates GitHub Issues for votes (alternative to serverless functions)
// Run this script periodically to collect votes from a temporary storage

const https = require('https');
const fs = require('fs');

// Configuration
const config = {
  owner: 'LiterallyTech',
  repo: 'Zep',
  token: process.env.GITHUB_TOKEN // Set this as an environment variable
};

// Function to create a GitHub Issue for a vote
function createVoteIssue(voteData) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${config.owner}/${config.repo}/issues`,
      method: 'POST',
      headers: {
        'User-Agent': 'Zep-Vote-Collector',
        'Authorization': `token ${config.token}`,
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', => {
        if (res.statusCode === 201) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`GitHub API error: ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', reject);
    
    const body = JSON.stringify({
      title: `Vote: ${voteData.type} for ${voteData.url}`,
      body: JSON.stringify(voteData),
      labels: ['vote']
    });
    
    req.write(body);
    req.end();
  });
}

// Example usage:
// createVoteIssue({
//   url: 'https://example.com',
//   type: 'positive',
//   timestamp: Date.now(),
//   userAgent: 'Mozilla/5.0...',
//   ip: '192.168.1.1'
// }).then(issue => {
//   console.log('Created issue:', issue.html_url);
// }).catch(err => {
//   console.error('Error creating issue:', err);
// });

module.exports = { createVoteIssue };