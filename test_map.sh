sed -i 's/<AddressPickerMap/\{false \&\& <AddressPickerMap/g' app/components/checkout-modal.tsx
sed -i 's/isLocating={isLocating}/isLocating={isLocating} \/>\}/g' app/components/checkout-modal.tsx
