import { BackyAccount } from '../../lib/account';
import { visitorWebsiteContext } from '../../lib/visitor-bff';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Website account', referrer: 'no-referrer' };
export default async function AccountPage() {
  try {
    const context = await visitorWebsiteContext();
    return <BackyAccount siteId={context.siteId} registrationEnabled={context.registrationEnabled} emailChangeAvailable={context.emailChangeAvailable} />;
  } catch {
    return <main style={{ maxWidth: 520, margin: '48px auto', padding: 24 }}><h1>Website account unavailable</h1><p>This website must enable visitor accounts, approve its exact origin and /account return URL, and configure the persisted Backy database and identity provider. Contact the website owner.</p></main>;
  }
}
