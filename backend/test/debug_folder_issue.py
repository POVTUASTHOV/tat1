import requests
import json

class FolderDebugger:
    def __init__(self, django_url="http://localhost:8000"):
        self.django_url = django_url
        self.token = None

    def login(self, email, password):
        response = requests.post(f"{self.django_url}/users/login/", json={
            "email": email, "password": password
        })
        if response.status_code == 200:
            self.token = response.json()["access"]
            return True
        return False

    def get_headers(self):
        return {"Authorization": f"Bearer {self.token}"}

    def debug_project_folders(self, project_id):
        print(f"\n=== DEBUGGING PROJECT {project_id} ===")
        
        project_response = requests.get(
            f"{self.django_url}/storage/projects/{project_id}/",
            headers=self.get_headers()
        )
        print(f"Project details: {project_response.status_code}")
        if project_response.status_code == 200:
            project = project_response.json()
            print(f"Project name: {project.get('name')}")
        
        folders_response = requests.get(
            f"{self.django_url}/storage/projects/{project_id}/folders/",
            headers=self.get_headers()
        )
        print(f"Folders response: {folders_response.status_code}")
        if folders_response.status_code == 200:
            folders = folders_response.json()
            print(f"Total folders: {len(folders)}")
            for folder in folders:
                print(f"  Folder: {folder['name']} ({folder['id']}) - Parent: {folder.get('parent')}")
        
        tree_response = requests.get(
            f"{self.django_url}/storage/projects/{project_id}/tree/",
            headers=self.get_headers()
        )
        print(f"Tree response: {tree_response.status_code}")
        if tree_response.status_code == 200:
            tree = tree_response.json()
            print("Project tree structure:")
            print(json.dumps(tree, indent=2))

    def test_folder_access(self, folder_id):
        print(f"\n=== TESTING FOLDER ACCESS {folder_id} ===")
        
        folder_response = requests.get(
            f"{self.django_url}/storage/folders/{folder_id}/",
            headers=self.get_headers()
        )
        print(f"Direct folder access: {folder_response.status_code}")
        if folder_response.status_code == 200:
            folder = folder_response.json()
            print(f"Folder details: {json.dumps(folder, indent=2)}")
        else:
            print(f"Error: {folder_response.text}")

def main():
    debugger = FolderDebugger()
    
    if not debugger.login("test@example.com", "testpassword123"):
        print("Login failed")
        return
    
    project_id = "0a43c21b-bb40-4d83-858a-cb1d237e96d0"
    
    debugger.debug_project_folders(project_id)
    
    folder_ids = [
        "2c08546a-75ea-4a3b-b083-694d474da3a5",
        "1d8f1a50-bcda-40e2-a40b-809d1d5b569a", 
        "8dde5c57-19fe-47b6-9c91-3fa39ba7f594"
    ]
    
    for folder_id in folder_ids:
        debugger.test_folder_access(folder_id)

if __name__ == "__main__":
    main()