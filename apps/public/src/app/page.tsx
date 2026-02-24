/**
 * Home page - shows landing or redirects to site
 */
export default function Home() {
    return (
        <main style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '2rem',
            textAlign: 'center',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
        }}>
            <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>
                Backy CMS
            </h1>
            <p style={{ fontSize: '1.25rem', opacity: 0.9, maxWidth: '600px' }}>
                Open-source visual website builder. Create beautiful websites with
                drag-and-drop simplicity.
            </p>
            <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
                <a
                    href="/admin"
                    style={{
                        padding: '12px 32px',
                        backgroundColor: 'white',
                        color: '#764ba2',
                        borderRadius: '8px',
                        fontWeight: 600,
                    }}
                >
                    Go to Admin
                </a>
            </div>
        </main>
    );
}
