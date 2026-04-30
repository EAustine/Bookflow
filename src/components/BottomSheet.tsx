import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { tokens } from '~/design/tokens';

export type BottomSheetRef = {
  present: () => void;
  dismiss: () => void;
};

export type BottomSheetProps = {
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onDismiss?: () => void;
  enablePanDownToClose?: boolean;
};

export const BottomSheet = forwardRef<BottomSheetRef, BottomSheetProps>(
  function BottomSheet(
    {
      title,
      children,
      footer,
      onDismiss,
      enablePanDownToClose = true,
    },
    ref,
  ) {
    const modalRef = useRef<BottomSheetModal>(null);

    useImperativeHandle(
      ref,
      () => ({
        present: () => modalRef.current?.present(),
        dismiss: () => modalRef.current?.dismiss(),
      }),
      [],
    );

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={tokens.bottomSheet.backdropOpacity}
          pressBehavior="close"
        />
      ),
      [],
    );

    return (
      <BottomSheetModal
        ref={modalRef}
        enableDynamicSizing
        enablePanDownToClose={enablePanDownToClose}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.background}
        handleIndicatorStyle={styles.handleIndicator}
        handleStyle={styles.handle}
        onDismiss={onDismiss}
      >
        <BottomSheetView style={styles.body}>
          {title && <Text style={styles.title}>{title}</Text>}
          {children}
          {footer && <View style={styles.footer}>{footer}</View>}
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  background: {
    backgroundColor: tokens.colors.cream[50],
    borderTopLeftRadius: tokens.bottomSheet.radius,
    borderTopRightRadius: tokens.bottomSheet.radius,
  },
  handle: {
    paddingTop: tokens.bottomSheet.handle.topMargin,
    paddingBottom: 4,
  },
  handleIndicator: {
    backgroundColor: tokens.colors.ink[300],
    width: tokens.bottomSheet.handle.width,
    height: tokens.bottomSheet.handle.height,
  },
  body: {
    paddingHorizontal: tokens.bottomSheet.paddingX,
    paddingBottom: tokens.bottomSheet.footerPaddingBottom,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: tokens.fontSizes.display.sm,
    fontWeight: '500',
    color: tokens.colors.ink[900],
    paddingTop: tokens.spacing[2],
    paddingBottom: tokens.spacing[3],
  },
  footer: {
    paddingTop: tokens.spacing[4],
    gap: tokens.spacing[2],
  },
});
