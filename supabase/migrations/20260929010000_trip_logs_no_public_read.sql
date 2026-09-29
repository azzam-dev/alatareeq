-- صفحة trips.html انشالت (التفاصيل صارت داخل التطبيق من سجلات الجوال نفسه)، فما عاد أحد يحتاج يقرأ المشاوير بالمفتاح العام
drop policy "test: page reads" on public.trip_logs;
