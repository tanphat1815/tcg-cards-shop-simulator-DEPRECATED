1. Cài đặt tool:

bash
"/c/Users/CPS/AppData/Local/Programs/Python/Python314/python.exe" -m pip install code-review-graph
2. Cấu hình cho Antigravity:

bash
"/c/Users/CPS/AppData/Local/Programs/Python/Python314/Scripts/code-review-graph.exe" install --platform antigravity
Nếu đường dẫn /c/... không hoạt động, bạn có thể thử dùng đường dẫn kiểu Windows nhưng bọc trong ngoặc kép:

bash
"C:\Users\CPS\AppData\Local\Programs\Python\Python314\python.exe" -m pip install code-review-graph
Sau khi cài xong, bạn hãy chạy lệnh này để khởi tạo graph cho dự án:

bash
"/c/Users/CPS/AppData/Local/Programs/Python/Python314/Scripts/code-review-graph.exe" build