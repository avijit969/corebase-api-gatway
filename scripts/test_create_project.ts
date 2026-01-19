const BASE_URL = 'http://localhost:3000/v1';

async function main() {
    console.log('--- Step 1: Login to get Token ---');
    try {
        const authResponse = await fetch(`${BASE_URL}/auth/token`, {
            method: 'POST',
            body: JSON.stringify({ email: 'test@example.com', password: 'password' }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (!authResponse.ok) {
            const text = await authResponse.text();
            try {
                const json = JSON.parse(text);
                console.error("ERROR_DETAILS:", json.error.details);
            } catch (e) {
                console.error("RAW_ERROR:", text);
            }
            process.exit(1);
        }

        const authData = await authResponse.json();
        const token = authData.data.access_token;
        console.log('Got Token:', token.substring(0, 20) + '...');

        console.log('\n--- Step 2: Create Project ---');
        const projectResponse = await fetch(`${BASE_URL}/projects`, {
            method: 'POST',
            body: JSON.stringify({ name: 'My Awesome Project' }),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (!projectResponse.ok) {
            const text = await projectResponse.text();
            try {
                const json = JSON.parse(text);
                console.error("PROJECT_ERROR_DETAILS:", json.error.details);
            } catch (e) {
                console.error("PROJECT_RAW_ERROR:", text);
            }
            process.exit(1);
        }

        const projectData = await projectResponse.json();
        console.log('Project Created Successfully!');
        console.log('Project ID:', projectData.data.id);
        console.log('DB URL:', projectData.data.database_url);
    } catch (e) {
        console.error('Script error:', e);
    }
}

main();
