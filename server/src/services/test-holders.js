// Add console.log to see if code is running
console.log('Starting holder check...');

const fetch = await import('node-fetch');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjhhYzQ4MDFiLTgwN2UtNGExMi05NjdjLTliMDM5ZDcyNjZkOSIsIm9yZ0lkIjoiNDI0NjU2IiwidXNlcklkIjoiNDM2NzQ5IiwidHlwZUlkIjoiNTdiM2FlYWEtMzUzNi00MzNhLTk3ODktYTViYzAzZDgyZGU0IiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3MzYzNTg3MTUsImV4cCI6NDg5MjExODcxNX0.JjFbeKYKVjtzwMPr17iVQ4Per73h4Qp9q918W798zrg';

// Log the URL we're calling
const tokenAddress = '0x4C13EC41C1c14Fe920d793311702F120a7D5b972';
const chain = 'eth';
const url = `https://deep-index.moralis.io/api/v2.2/erc20/${tokenAddress}/owners?chain=${chain}&limit=100`;
console.log('API URL:', url);

async function getHolderCount() {
    try {
        console.log('Making API call...');
        const response = await fetch.default(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'X-API-Key': API_KEY
            }
        });

        console.log('Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Response:', JSON.stringify(data, null, 2));
        
    } catch (error) {
        console.error('Error:', error);
    }
}

// Actually call the function
console.log('Calling getHolderCount...');
getHolderCount();