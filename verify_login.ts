const users = [
    { email: 'mayerlinrocam@gmail.com', password: '12345678' },
    { email: 'odalisg024@gmail.com', password: '12345678' },
    { email: 'rosyerazo.51@gmail.com', password: '12345678' },
    { email: 'toledostefanny65@gmail.com', password: '12345678' },
    { email: 'fredyrobotina@hotmail.com', password: '12345678' }
];

async function verifyLogins() {
    console.log('Verifying logins...');
    for (const user of users) {
        try {
            const response = await fetch('http://127.0.0.1:3000/user/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: user.email,
                    password: user.password
                })
            });

            if (response.ok) {
                console.log(`✅ Login successful for ${user.email}`);
            } else {
                const data = await response.text();
                console.error(`❌ Login failed for ${user.email}: ${response.status} - ${data}`);
            }
        } catch (error) {
            console.error(`❌ Request failed for ${user.email}:`, error);
        }
    }
}

verifyLogins();
