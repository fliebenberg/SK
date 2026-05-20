import React from 'react';
import { Dialog as TamaguiDialog, YStack, XStack } from 'tamagui';
import { X } from 'lucide-react-native';
import { Button } from './Button';

export const Dialog = TamaguiDialog;
export const DialogTrigger = TamaguiDialog.Trigger;
export const DialogPortal = TamaguiDialog.Portal;
export const DialogClose = TamaguiDialog.Close;

const OverlayComponent = TamaguiDialog.Overlay as any;
const ContentComponent = TamaguiDialog.Content as any;

export const DialogOverlay = React.forwardRef<any, any>(({ style, ...props }, ref) => (
  <OverlayComponent
    ref={ref}
    key="overlay"
    animation="quick"
    opacity={0.8}
    enterStyle={{ opacity: 0 }}
    exitStyle={{ opacity: 0 }}
    backgroundColor="rgba(0, 0, 0, 0.75)"
    {...props}
  />
));
DialogOverlay.displayName = 'DialogOverlay';

export const DialogContent = React.forwardRef<any, any>(
  ({ children, hideCloseButton = false, style, ...props }, ref) => (
    <TamaguiDialog.Portal>
      <DialogOverlay />
      <ContentComponent
        ref={ref}
        bordered
        elevate
        key="content"
        animateOnly={['transform', 'opacity']}
        animation={[
          'quick',
          {
            opacity: {
              overshootClamping: true,
            },
          },
        ]}
        enterStyle={{ y: -20, opacity: 0, scale: 0.95 }}
        exitStyle={{ y: 10, opacity: 0, scale: 0.95 }}
        gap="$4"
        backgroundColor="$background"
        borderRadius={12}
        padding="$5"
        width="90%"
        maxWidth={500}
        alignSelf="center"
        {...props}
      >
        {children}
        {!hideCloseButton && (
          <TamaguiDialog.Close asChild>
            <Button
              size="icon"
              variant="ghost"
              icon={<X size={16} color="currentColor" />}
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                height: 32,
                width: 32,
                backgroundColor: 'transparent',
              }}
            />
          </TamaguiDialog.Close>
        )}
      </ContentComponent>
    </TamaguiDialog.Portal>
  )
);
DialogContent.displayName = 'DialogContent';

export const DialogHeader = ({ style, ...props }: any) => (
  <YStack gap="$1.5" style={style} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

export const DialogFooter = ({ style, ...props }: any) => (
  <XStack gap="$2" justifyContent="flex-end" flexWrap="wrap" style={style} {...props} />
);
DialogFooter.displayName = 'DialogFooter';

export const DialogTitle = React.forwardRef<any, any>(({ style, ...props }, ref) => (
  <TamaguiDialog.Title
    ref={ref}
    fontFamily="$heading"
    fontWeight="700"
    fontSize={18}
    color="$color"
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = React.forwardRef<any, any>(({ style, ...props }, ref) => (
  <TamaguiDialog.Description
    ref={ref}
    fontFamily="$body"
    fontSize={14}
    color="$muted-foreground"
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';
