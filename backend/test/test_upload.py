import requests
import os
import json
from pathlib import Path
import math

class NASUploadClient:
    def __init__(self, django_url="http://localhost:8000", fastapi_url="http://localhost:8001"):
        self.django_url = django_url
        self.fastapi_url = fastapi_url
        self.token = None
        self.chunk_size = 1024 * 1024

    def login(self, email, password):
        response = requests.post(f"{self.django_url}/users/login/", json={
            "email": email,
            "password": password
        })
        print(f"Login response: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            self.token = data["access"]
            return True
        print(f"Login failed: {response.text}")
        return False

    def get_headers(self):
        return {"Authorization": f"Bearer {self.token}"}

    def get_existing_project(self, name):
        response = requests.get(f"{self.django_url}/storage/projects/", headers=self.get_headers())
        if response.status_code == 200:
            projects_data = response.json()
            projects = projects_data.get('results', projects_data) if isinstance(projects_data, dict) else projects_data
            for project in projects:
                if project["name"] == name:
                    print(f"Found existing project: {name} ({project['id']})")
                    return project
        return None

    def create_project(self, name, description=""):
        existing = self.get_existing_project(name)
        if existing:
            return existing
            
        response = requests.post(
            f"{self.django_url}/storage/projects/",
            json={"name": name, "description": description},
            headers=self.get_headers()
        )
        print(f"Create project response: {response.status_code}")
        if response.status_code == 201:
            return response.json()
        print(f"Create project failed: {response.text}")
        return None

    def get_existing_folder(self, project_id, name, parent_id=None):
        params = {}
        if parent_id:
            params["parent_id"] = parent_id
            
        response = requests.get(
            f"{self.django_url}/storage/projects/{project_id}/folders/",
            params=params,
            headers=self.get_headers()
        )
        if response.status_code == 200:
            folders_data = response.json()
            folders = folders_data.get('results', folders_data) if isinstance(folders_data, dict) else folders_data
            for folder in folders:
                if folder["name"] == name:
                    print(f"Found existing folder: {name} ({folder['id']})")
                    return folder
        return None

    def create_folder(self, project_id, name, parent_id=None):
        existing = self.get_existing_folder(project_id, name, parent_id)
        if existing:
            return existing
            
        payload = {"name": name}
        if parent_id:
            payload["parent"] = parent_id
            
        response = requests.post(
            f"{self.django_url}/storage/projects/{project_id}/create_folder/",
            json=payload,
            headers=self.get_headers()
        )
        print(f"Create folder '{name}' response: {response.status_code}")
        if response.status_code == 201:
            return response.json()
        print(f"Create folder failed: {response.text}")
        return None

    def file_exists_in_folder(self, project_id, folder_id, filename):
        params = {"project_id": project_id}
        if folder_id:
            params["folder_id"] = folder_id
            
        response = requests.get(
            f"{self.django_url}/file-management/files/list_files/",
            params=params,
            headers=self.get_headers()
        )
        
        if response.status_code == 200:
            files_data = response.json()
            files = files_data.get("files", [])
            for file_obj in files:
                if file_obj["name"] == filename:
                    print(f"File {filename} already exists in folder")
                    return True
        return False

    def upload_file_chunked(self, file_path, project_id, folder_id=None):
        file_path = Path(file_path)
        if not file_path.exists():
            print(f"File not found: {file_path}")
            return None

        filename = file_path.name
        if self.file_exists_in_folder(project_id, folder_id, filename):
            print(f"Skipping upload: {filename} already exists")
            return {"name": filename, "status": "already_exists"}

        file_size = file_path.stat().st_size
        total_chunks = math.ceil(file_size / self.chunk_size)

        print(f"Uploading {filename}: {file_size} bytes in {total_chunks} chunks")

        with open(file_path, 'rb') as f:
            for chunk_number in range(total_chunks):
                chunk_data = f.read(self.chunk_size)
                
                files = {'file': (filename, chunk_data, 'application/octet-stream')}
                data = {
                    'filename': filename,
                    'chunk_number': chunk_number,
                    'total_chunks': total_chunks,
                    'total_size': file_size,
                    'project_id': project_id
                }
                
                if folder_id:
                    data['folder_id'] = folder_id

                response = requests.post(
                    f"{self.fastapi_url}/api/upload/chunk/",
                    files=files,
                    data=data,
                    headers=self.get_headers()
                )

                if response.status_code != 200:
                    print(f"Chunk {chunk_number} upload failed: {response.text}")
                    return None

        complete_payload = {
            'filename': filename,
            'project_id': project_id
        }
        if folder_id:
            complete_payload['folder_id'] = folder_id

        complete_response = requests.post(
            f"{self.fastapi_url}/api/upload/complete/",
            json=complete_payload,
            headers=self.get_headers()
        )

        if complete_response.status_code == 200:
            print(f"Successfully uploaded: {filename}")
            return complete_response.json()
        else:
            print(f"Complete upload failed: {complete_response.text}")
            return None

    def check_file_existence(self, file_path):
        file_path = Path(file_path)
        if file_path.exists():
            size = file_path.stat().st_size
            print(f"File exists: {file_path} ({size} bytes)")
            return True
        else:
            print(f"File NOT found: {file_path}")
            return False

    def get_project_summary(self, project_id):
        response = requests.get(
            f"{self.django_url}/storage/projects/{project_id}/tree/",
            headers=self.get_headers()
        )
        if response.status_code == 200:
            return response.json()
        return None

def main():
    login_data = {"email": "test@example.com", "password": "testpassword123"}
    
    client = NASUploadClient()
    
    files_to_upload = [
        "/media/tat/backup/bai_toan/30_4/12q.mp4",
        "/media/tat/backup/bai_toan/30_4/HungKHi_Training/0356_gan/DJI_0356_W_0001.jpg",
        "/media/tat/backup/bai_toan/code.zip"
    ]
    
    print("=== CHECKING FILE EXISTENCE ===")
    all_files_exist = True
    for file_path in files_to_upload:
        if not client.check_file_existence(file_path):
            all_files_exist = False
    
    if not all_files_exist:
        print("Some files are missing. Aborting.")
        return

    print("\n=== LOGIN ===")
    if not client.login(login_data["email"], login_data["password"]):
        return

    print("\n=== PROJECT SETUP ===")
    project = client.create_project("ABC", "Test project ABC")
    if not project:
        print("Failed to create/get project")
        return
    
    project_id = project["id"]

    print("\n=== FOLDER SETUP ===")
    videos_folder = client.create_folder(project_id, "videos")
    if not videos_folder:
        print("Failed to create/get videos folder")
        return
    videos_folder_id = videos_folder["id"]

    vd_folder = client.create_folder(project_id, "VD", videos_folder_id)
    if not vd_folder:
        print("Failed to create/get VD subfolder")
        return
    vd_folder_id = vd_folder["id"]

    datazip_folder = client.create_folder(project_id, "datazip")
    if not datazip_folder:
        print("Failed to create/get datazip folder")
        return
    datazip_folder_id = datazip_folder["id"]

    print("\n=== FILE UPLOADS ===")
    
    uploads = [
        {
            "file": "/media/tat/backup/bai_toan/30_4/12q.mp4",
            "folder_id": videos_folder_id,
            "description": "video file to videos folder"
        },
        {
            "file": "/media/tat/backup/bai_toan/30_4/HungKHi_Training/0356_gan/DJI_0356_W_0001.jpg",
            "folder_id": vd_folder_id,
            "description": "image file to VD subfolder"
        },
        {
            "file": "/media/tat/backup/bai_toan/code.zip",
            "folder_id": datazip_folder_id,
            "description": "zip file to datazip folder"
        }
    ]

    for upload in uploads:
        print(f"\nUploading {upload['description']}:")
        result = client.upload_file_chunked(
            upload["file"],
            project_id,
            upload["folder_id"]
        )
        if result:
            print(f"✓ SUCCESS: {result['name']}")
        else:
            print("✗ FAILED")

    print("\n=== FINAL SUMMARY ===")
    summary = client.get_project_summary(project_id)
    if summary:
        print(f"Project: {summary['name']}")
        print(f"Total folders: {len(summary.get('folders', []))}")
        total_files = len(summary.get('files', []))
        for folder in summary.get('folders', []):
            total_files += len(folder.get('files', []))
            for child in folder.get('children', []):
                total_files += len(child.get('files', []))
        print(f"Total files: {total_files}")

if __name__ == "__main__":
    main()