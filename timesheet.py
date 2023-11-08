#!/usr/bin/env python3

from pathlib import Path
import shutil
import subprocess
import zipfile
from conf import url, projects, default_project, empty_project, default_hours
from datetime import date, datetime, timedelta
import re
import os
import sys
import os.path
import json
import urllib.request
from jinja2 import Template
from posixpath import dirname
from time import sleep
from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.common.exceptions import StaleElementReferenceException, SessionNotCreatedException

def exit_with_prompt(code=0):
	input("Press Enter to continue...")
	exit(code)

def download_chrome_driver():
	cp = subprocess.run(['google-chrome', '--version'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False, encoding='utf-8')
	m = re.search(f'[0-9]+\.[0-9]+\.[0-9]+', cp.stdout)
	if (cp.returncode != 0) or (m is None):
		print('Cannot download chromedriver automatically!')
		return
	ver = m.group(0)
	print(f'Current version: {ver}')
	with urllib.request.urlopen(f'https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json') as fd:
		versions = json.load(fd)
		fd.close()
	for version in versions['versions']:
		this_ver = version['version']
		if (this_ver.startswith(ver) or ver.startswith(this_ver)) and ('chromedriver' in version['downloads']):
			platforms = version['downloads']['chromedriver']
			break
	else:
		print('Can\'t download correct version automatically')
		exit(1)

	for platform in platforms:
		if (sys.platform == 'win32') and platform['platform'] == 'win64':
			break
		elif (sys.platform == 'linux') and platform['platform'] == 'linux64':
			break
		elif (sys.platform == 'mac-x64') and platform['platform'] == 'darwin':
			break
	else:
		print('Can\'t download correct platform automatically')
		exit(1)

	print(platform['url'])
	zip_path = Path(__file__).parent / 'chromedriver.zip'
	with urllib.request.urlopen(platform['url']) as src:
		with open(zip_path, 'wb') as dst:
			shutil.copyfileobj(src, dst)
	with zipfile.ZipFile(zip_path, 'r') as zip_ref:
		zip_ref.extractall(Path(__file__).parent)
		for name in zip_ref.namelist():
			p = Path(name)
			if (p.name.count('chromedriver') == 1) and (p.suffix == '' or p.suffix.upper() == '.EXE'):
				exe_name = p
	expected = Path('chromedriver')
	if sys.platform == 'win32': expected.suffix = '.exe'
	if (exe_name != expected):
		shutil.copyfile(Path(__file__).parent / exe_name, Path(__file__).parent / expected)
	os.chmod(Path(__file__).parent / expected, 0o755)
	cp = subprocess.run([str(Path(__file__).parent / expected), '--version'], check=True)
	print('Automatic download successful. You can now restart the script.')


	# with urllib.request.urlopen(f'https://chromedriver.storage.googleapis.com/LATEST_RELEASE_{ver}') as fd:
	# 	driver_ver = fd.read().decode('utf-8')
	# m = re.match(f'[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?', driver_ver)
	# if m is None:
	# 	print('Cannot download chromedriver automatically!')
	# 	return
	# print(f'Chromedriver version: {driver_ver}')
	# zip_path = Path(__file__).parent / 'chromedriver_linux64.zip'
	# with urllib.request.urlopen(f'https://chromedriver.storage.googleapis.com/{driver_ver}/chromedriver_linux64.zip') as src:
	# 	with open(zip_path, 'wb') as dst:
	# 		shutil.copyfileobj(src, dst)
	# with zipfile.ZipFile(zip_path, 'r') as zip_ref:
	# 	zip_ref.extractall(Path(__file__).parent)
	# os.chmod(Path(__file__).parent / 'chromedriver', 0o755)
	# cp = subprocess.run([str(Path(__file__).parent / 'chromedriver'), '--version'], check=True)
	# print('Automatic download successful. You can now restart the script.')

script_dir = dirname(os.path.realpath(__file__))

if not (os.path.isfile(script_dir + '/chromedriver') or os.path.isfile(script_dir + '/chromedriver.exe')):
	print(f'Cannot find Chrome WebDriver binary in "{script_dir}" directory.')
	print('Download it from:')
	print('   https://chromedriver.storage.googleapis.com/index.html')
	download_chrome_driver()
	input("Press Enter to restart...")
	subprocess.call(f"python {os.path.realpath(__file__)}", shell=True)
	exit(0)

os.environ["PATH"] = os.environ["PATH"] + ":" + script_dir

next_inject_id = 1

def filter_by_regex(elements, attr_name, regex=''):
	regex = re.compile(regex)
	result = []
	try:
		for e in elements:
			if type(attr_name) is list:
				match = True
				for m in attr_name:
					text = str(e.get_attribute(m[0]))
					match = match and re.fullmatch(m[1], text)
			else:
				text = str(e.get_attribute(attr_name))
				match = regex.fullmatch(text)
			if match:
				result.append(e)
	except StaleElementReferenceException:
		return []
	return result

def find_all_with_regex(selector, attr_name, regex=''):
	global driver
	start = datetime.now()
	arr = filter_by_regex(driver.find_elements_by_css_selector(selector), attr_name, regex)
	while len(arr) == 0:
		if (datetime.now() - start).seconds >= 25:
			raise TimeoutError()
		sleep(0.1)
		arr = filter_by_regex(driver.find_elements_by_css_selector(selector), attr_name, regex)
	return arr

def find_with_regex(selector, attr_name, regex=''):
	arr = find_all_with_regex(selector, attr_name, regex)
	assert len(arr) == 1
	return arr[0]

def get_tree_distance(base, element):
	parents = set()
	try:
		while base is not None:
			parents.add(base)
			base = base.find_element_by_xpath("./..")
	except:
		pass
	try:
		num = 0
		while element is not None:
			if element in parents:
				return num
			num += 1
			element = element.find_element_by_xpath("./..")
	except:
		pass
	return num

def inject_html(file, data = dict()):
	global driver, next_inject_id
	with open(file) as f:
		html = ' '.join(f.readlines())
	id = f'--injected-{next_inject_id}'
	next_inject_id += 1
	template = Template(html)
	html = template.render(id=id, **data)
	driver.execute_script(f'''
		let div = document.createElement("div");
		div.innerHTML = {json.dumps(html)};
		document.getElementsByTagName("body")[0].appendChild(div.firstChild);
		''')
	return driver.find_element_by_id(id)

def remove_html(window):
	global driver
	driver.execute_script('''
		arguments[0].innerHTML="";
		document.getElementsByTagName("body")[0].removeChild(arguments[0]);
		''', window)

def get_user_input(clear=False, name='_userInput'):
	global driver
	res = driver.execute_script(f'return window.{name}')
	if (res is not None) and clear:
		driver.execute_script(f'window.{name} = null')
	return res

def wait_for_user_input(driver):
	return get_user_input() is not None

def select_period():
	global driver, script_dir
	while True:
		print('Waiting for key')
		new_button = find_with_regex('button,a', 'innerText', r'New|Forgot my password|I can\'t use my Microsoft Authenticator app right now')
		if new_button.get_attribute('innerText') == 'New':
			print('New')
			break
		else:
			print('Sign in')
			print('Sleeping')
			sleep(1)
	new_button.click()
	date_input = find_with_regex('input[type="text"][id^="TSTimesheetCreate"]', 'id', r'TSTimesheetCreate.*DateFrom.*')
	now = date.today()
	periods = [
		{'name': 'This week', 'value': 0},
		{'name': 'Last week', 'value': 7},
		{'name': 'Two weeks ago', 'value': 2 * 7}
	]
	for p in periods:
		days = p['value']
		pstr = (now - timedelta(days)).strftime('%d.%m.%Y')
		p['name'] += f' ({pstr})'
	window = inject_html(f'{script_dir}/period.html.jinja', { 'periods': periods })
	WebDriverWait(driver, 10000000).until(wait_for_user_input)
	remove_html(window)
	days = get_user_input(True)
	if days >= 0:
		date_str = (now - timedelta(days)).strftime('%d.%m.%Y')
		date_input.send_keys(Keys.CONTROL + 'a')
		date_input.send_keys(date_str)
		ok_button = find_with_regex('button[id^="TSTimesheetCreate_"]', 'id', r'TSTimesheetCreate_.*_OK')
		ok_button.click()
		sleep(5)
		return True
	else:
		return False

def select_work():
	global driver, script_dir
	days = []
	for e in find_all_with_regex('div[data-dyn-columnname^="TSTimesheetLineWeek_Hours_"]', []):
		name = e.get_attribute('data-dyn-columnname')
		day = { 'id': name[-1:], 'text': e.get_attribute('innerText').strip(), 'checked': default_project }
		if day['text'][0] == '*':
			day['checked'] = empty_project
		days.append(day)
	window = inject_html(f'{script_dir}/work.html.jinja', { 'days': days, 'projects': projects })
	WebDriverWait(driver, 10000000).until(wait_for_user_input)
	rows = []
	user_input = get_user_input(True)
	if user_input == 'cancel':
		remove_html(window)
		return False
	assert user_input == 'ok'
	for prj in projects:
		add = False
		row = {'prj': prj[2], 'cat': prj[3]}
		for day in days:
			radio = find_with_regex(f'#_my_prj_{day["id"]}_{prj[0]}', [])
			if radio.get_attribute('checked'):
				row[day['id']] = default_hours
				add = True
		if add and prj[2] != 0:
			rows.append(row)
	remove_html(window)
	for row in rows:
		new_button = find_with_regex('button[data-dyn-controlname="NewLine"]', 'innerText', r'New line')
		new_button.click()
		proj_id_input = find_with_regex('input[type="text"][id^="ProjId_"][id$="_input"][value=""]', [])
		proj_id_input.send_keys(str(row['prj']))
		cat_id_input = find_with_regex('input[type="text"][id^="CatergoryName_"][id$="_input"][value=""]', [])
		cat_id_input.send_keys(str(row['cat']))
		for day in days:
			if day['id'] not in row:
				continue
			arr = find_all_with_regex('input[type="text"][id^="TSTimesheetLineWeek_Hours_"][id$="_input"][value=""]',
				'id', f'TSTimesheetLineWeek_Hours_{day["id"]}_.*_input')
			assert len(arr) > 0
			arr.sort(key = (lambda x : get_tree_distance(proj_id_input, x)))
			arr[0].send_keys(str(row[day['id']]))
		proj_id_input.click()
	find_with_regex('button[data-dyn-controlname="SystemDefinedSaveButton"]', 'innerText', 'Save').click()
	sleep(0.5)
	find_with_regex('button[data-dyn-controlname*="Workflow"]', 'innerText', 'Workflow').click()
	return True

def select_menu():
	global driver, script_dir
	window = inject_html(f'{script_dir}/menu.html.jinja')
	WebDriverWait(driver, 10000000).until(wait_for_user_input)
	remove_html(window)
	return get_user_input(True)

options = ChromeOptions()
options.page_load_strategy = 'normal'
options.add_argument(f'user-data-dir={script_dir}/user-data')
try:
	driver = webdriver.Chrome(options=options)
except SessionNotCreatedException as ex:
	text = str(ex)
	if text.find('ChromeDriver') < 0:
		raise
	print(ex.msg)
	print('Chrome WebDriver version maybe incorrect.')
	print('Download it from:')
	print('   https://chromedriver.storage.googleapis.com/index.html')
	print('and place it in:')
	print(f'   {script_dir}')
	download_chrome_driver()
	input("Press Enter to restart...")
	subprocess.call(f"python {os.path.realpath(__file__)}", shell=True)
	exit(0)

driver.implicitly_wait(26)
driver.get(url)

state = 'new'

while True:
	try:
		if state == 'new':
			selected = select_period()
			state = 'work' if selected else 'menu'
		elif state == 'work':
			select_work()
			state = 'menu'
		elif state == 'menu':
			state = select_menu()
		elif state == 'exit':
			driver.quit()
			break
	except TimeoutError:
		get_user_input(True)
		window = inject_html(f'{script_dir}/error.html.jinja')
		WebDriverWait(driver, 10000000).until(wait_for_user_input)
		remove_html(window)
		if get_user_input(True):
			state = 'menu'
		else:
			state = 'exit'
	except:
		try:
			driver.quit()
		except:
			pass
		raise
