sed -i '1116,1186c\
                  <div className="border-b border-slate-100 pb-3 mb-4">\
                    <p className="text-xs text-slate-700 font-mono leading-relaxed">\
                      You have chosen <span className="font-bold text-slate-900">{selectedCourier?.name}</span> to handle your delivery from PRIME Network Distribution &amp; Fulfillment Center with a corresponding charge of <span className="font-bold text-slate-900">{formatPHP(courierDeliveryFee)}</span>. How would you like to pay for the charge?\
                    </p>\
                  </div>\
                  <div className="flex flex-col sm:flex-row gap-3">\
                    <button\
                      type="button"\
                      onClick={() => setDeliveryPaymentMethod("upon_checkout")}\
                      className={`flex-1 px-3.5 py-1.5 rounded-lg text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs text-center border ${\
                        deliveryPaymentMethod === "upon_checkout"\
                          ? "bg-slate-900 border-slate-900 text-white hover:bg-black"\
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"\
                      }`}\
                    >\
                      UPON CHECKOUT\
                    </button>\
                    <button\
                      type="button"\
                      onClick={() => setDeliveryPaymentMethod("upon_delivery")}\
                      className={`flex-1 px-3.5 py-1.5 rounded-lg text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs text-center border ${\
                        deliveryPaymentMethod === "upon_delivery"\
                          ? "bg-slate-900 border-slate-900 text-white hover:bg-black"\
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"\
                      }`}\
                    >\
                      UPON DELIVERY\
                    </button>\
                  </div>\
' app/components/checkout-modal.tsx
