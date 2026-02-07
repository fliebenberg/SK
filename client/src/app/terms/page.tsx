import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TermsOfServicePage() {
  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <Card className="border-none bg-transparent shadow-none">
        <CardHeader className="text-center">
          <CardTitle className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Terms of Service
          </CardTitle>
          <p className="mt-4 text-muted-foreground">Last Updated: February 7, 2026</p>
        </CardHeader>
        <CardContent className="mt-8 space-y-8 text-foreground/80 leading-relaxed">
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">1. Acceptance of Terms</h2>
            <p>
              By accessing or using ScoreKeeper, you agree to be bound by these Terms of Service. 
              If you do not agree to these terms, please do not use our service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">2. Use of Service</h2>
            <p>
              You agree to use ScoreKeeper only for lawful purposes and in accordance with these Terms. 
              You are responsible for maintaining the confidentiality of your account credentials.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">3. User Content</h2>
            <p>
              You retain ownership of any content you post to ScoreKeeper. However, by posting content, 
              you grant us a non-exclusive, worldwide, royalty-free license to use, display, and distribute that content.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">4. Termination</h2>
            <p>
              We reserve the right to terminate or suspend your account at our sole discretion, 
              without notice, for conduct that we believe violates these Terms or is harmful to other users.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">5. Limitation of Liability</h2>
            <p>
              ScoreKeeper is provided "as is" without any warranties. We shall not be liable for any indirect, 
              incidental, or consequential damages arising out of your use of the service.
            </p>
          </section>

          <section className="space-y-4 pt-8 border-t">
            <h2 className="text-xl font-semibold text-foreground">Contact Us</h2>
            <p>
              If you have any questions about these Terms of Service, please contact us at support@scorekeeper.app.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
