import requests
import json

def test_api_endpoints():
    base_url = "http://localhost:8000"
    login_data = {"email": "test@example.com", "password": "testpassword123"}
    
    response = requests.post(f"{base_url}/users/login/", json=login_data)
    token = response.json()["access"]
    headers = {"Authorization": f"Bearer {token}"}
    
    print("1. Testing projects list:")
    response = requests.get(f"{base_url}/file-management/files/projects_list/", headers=headers)
    projects = response.json()
    print(json.dumps(projects, indent=2))
    
    print("\n2. Testing all files:")
    response = requests.get(f"{base_url}/file-management/files/all_files/", headers=headers)
    all_files = response.json()
    print(json.dumps(all_files, indent=2))
    
    print("\n3. Testing files by project:")
    response = requests.get(f"{base_url}/file-management/files/by_project/", headers=headers)
    by_project = response.json()
    print(json.dumps(by_project, indent=2))
    
    if projects.get('projects'):
        project_id = projects['projects'][0]['id']
        print(f"\n4. Testing files for project {project_id}:")
        response = requests.get(f"{base_url}/file-management/files/list_files/?project_id={project_id}", headers=headers)
        project_files = response.json()
        print(json.dumps(project_files, indent=2))

if __name__ == "__main__":
    test_api_endpoints()