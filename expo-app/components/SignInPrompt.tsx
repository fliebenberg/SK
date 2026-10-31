import React from 'react';
import { usePathname, useRouter } from 'expo-router';
import { ConfirmationModal } from './ConfirmationModal';

interface SignInPromptProps {
  isOpen: boolean;
  onClose: () => void;
  /** What signing in lets them do, as a heading: "Sign in to add an organisation". */
  title: string;
  /** One line on what they get once signed in. */
  description: string;
}

/**
 * What a signed-out visitor sees on pressing something that needs an account (2026-10-31). The
 * action stays on the page for them rather than being hidden, so they learn it exists; this says
 * what it takes and offers the way in, coming back to this page after signing in.
 */
export const SignInPrompt: React.FC<SignInPromptProps> = ({ isOpen, onClose, title, description }) => {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <ConfirmationModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description}
      variant="primary"
      confirmText="Sign in"
      cancelText="Not now"
      onConfirm={() => {
        onClose();
        router.push({ pathname: '/(auth)/login', params: { redirect: pathname } });
      }}
    />
  );
};
