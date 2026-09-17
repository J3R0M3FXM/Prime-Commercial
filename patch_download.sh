sed -i '1835,1859c\
                  type="button"\
                  onClick={() => {\
                    const url = zoomedPaymentMethod.qrCodeImage || zoomedPaymentMethod.qrCode || zoomedPaymentMethod.qrImage || zoomedPaymentMethod.qr_code_image;\
                    const filename = `PRIME_QR_${zoomedPaymentMethod.name.replace(/\s+/g, "_")}.png`;\
                    const proxyUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;\
                    const link = document.createElement("a");\
                    link.href = proxyUrl;\
                    link.download = filename;\
                    document.body.appendChild(link);\
                    link.click();\
                    document.body.removeChild(link);\
                  }}\
' app/components/checkout-modal.tsx
