import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <Card className="border-none bg-transparent shadow-none">
        <CardHeader className="text-center">
          <CardTitle className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Privacy Policy
          </CardTitle>
          <p className="mt-4 text-muted-foreground">Last Updated: February 7, 2026</p>
        </CardHeader>
        <CardContent className="mt-8 space-y-8 text-foreground/80 leading-relaxed">
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">1. Introduction</h2>
            <p>
              Welcome to ScoreKeeper. We value your privacy and are committed to protecting your personal data. 
              This Privacy Policy explains how we collect, use, and safeguard your information when you use our service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">2. Data We Collect</h2>
            <p>
              We collect information that you provide directly to us when you create an account, such as:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Name and email address.</li>
              <li>Profile information.</li>
              <li>Authentication data (via Google or other providers).</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">3. How We Use Your Data</h2>
            <p>
              Your data is used to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide, maintain, and improve our services.</li>
              <li>Personalize your experience.</li>
              <li>Communicate with you about updates or support.</li>
              <li>Ensure the security of our application.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">4. Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your data. However, no method of transmission 
              over the internet is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">5. Your Rights</h2>
            <p>
              Depending on your location, you may have rights to access, correct, or delete your personal data. 
              Please contact us if you wish to exercise these rights.
            </p>
          </section>

          <section className="space-y-4 pt-8 border-t">
            <h2 className="text-xl font-semibold text-foreground">Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy, please contact us at support@scorekeeper.app.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
