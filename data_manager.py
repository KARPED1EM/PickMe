import os

BASE_DIR = os.path.dirname(__file__)
data_path = os.path.join(BASE_DIR, "data", "students_data.json")


class DataManager:
    @staticmethod
    def get_students_data() -> str:
        try:
            with open(data_path, "r", encoding="utf-8") as file:
                return file.read()
        except FileNotFoundError:
            return '{"cooldown_days":3,"students":[]}'
        except UnicodeDecodeError:
            with open(data_path, "r", encoding="utf-8-sig") as file:
                return file.read()

    @staticmethod
    def save_students_data(data: str) -> None:
        folder = os.path.dirname(data_path)
        if folder and not os.path.exists(folder):
            os.makedirs(folder, exist_ok=True)
        with open(data_path, "w", encoding="utf-8") as file:
            file.write(data)
