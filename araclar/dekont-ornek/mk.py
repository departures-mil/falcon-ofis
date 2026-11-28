from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
F='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'; FB='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def img(name, lines, dark=False, rtl=False):
    W,H=720,80+70*len(lines)
    bg,fg=('#111827','#f3f4f6') if dark else ('white','black')
    im=Image.new('RGB',(W,H),bg); d=ImageDraw.Draw(im); y=40
    for t,b in lines:
        f=ImageFont.truetype(FB if b else F, 42 if b else 30)
        if rtl:
            w=d.textlength(t,font=f,direction='rtl',language='ar'); d.text((W-40-w,y),t,font=f,fill=fg,direction='rtl',language='ar')
        else: d.text((40,y),t,font=f,fill=fg)
        y+=70
    im.save(name)
img('sham-en.png',[("Sham Cash",1),("Transfer Successful",0),("Amount: 1,000.00 USD",1),("Date: 27/11/2026 14:32",0),("From: Ahmad Khalil",0),("To: Falcon Company",0),("Transaction ID: SC-88412093",0),("Fee: 0.00 USD",0)], dark=True)
img('sham-ar.png',[("شام كاش",1),("تمت العملية بنجاح",0),("المبلغ: 500 USD",1),("المرسل: أحمد خليل",0),("رقم العملية: 774512903",0),("التاريخ: 2026/11/26",0)], rtl=True)
c=canvas.Canvas('banka.pdf'); y=780
for t in ["Bank Transfer Receipt","Amount: 3,000.00 USD","Date: 25.11.2026","Sender: Mehmet Yilmaz","Reference No: TR2026112500451"]:
    c.drawString(72,y,t); y-=24
c.save()
